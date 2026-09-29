function cleanText(v,max){return typeof v==='string'?v.trim().slice(0,max):''}
function safeLink(v){if(!v)return '';try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
function cleanBook(d){
 if(!d||typeof d!=='object')return null;const title={},description={},video={};
 for(const lang of ['kk','ru','en']){title[lang]=cleanText(d.title?.[lang],180);description[lang]=cleanText(d.description?.[lang],1500);const raw=d.video?.[lang]||'';video[lang]=safeLink(raw);if(raw&&!video[lang])return null}
 if(!title.kk||!title.ru||!video.kk&&!video.ru&&!video.en)return null;
 title.en=title.en||title.ru;description.en=description.en||description.ru;
 const author=cleanText(d.author,160),cover=safeLink(d.cover);if(!author||d.cover&&!cover)return null;
 return {title,description,video,author,cover,genre:Number.isInteger(d.genre)&&d.genre>=0&&d.genre<=6?d.genre:6};
}
async function managedApi(req,env,user,guest,url){
 const path=url.pathname,db=env.DB,now=Date.now();
 if(path==='/api/visit'&&req.method==='POST'){
  const day=new Date(now+5*3600000).toISOString().slice(0,10);
  await db.prepare('INSERT INTO site_visits (visitor,day,user_id,views,last_seen) VALUES (?,?,?,1,?) ON CONFLICT(visitor,day) DO UPDATE SET views=site_visits.views+1,user_id=COALESCE(excluded.user_id,site_visits.user_id),last_seen=excluded.last_seen').bind(guest,day,user?.id||null,now).run();return reply({ok:true},200,guest);
 }
 if(path==='/api/catalog'&&req.method==='GET'){
  const rows=(await db.prepare('SELECT id,data FROM custom_books WHERE published=1 ORDER BY created').bind().all()).results;
  return reply({books:rows.map(r=>{const d=JSON.parse(r.data);return {id:r.id,title:d.title,author:d.author,desc:d.description,cover:d.cover,genre:d.genre,color:'#244d40',url:'/book.html?book='+r.id}})});
 }
 if(path==='/api/book'&&req.method==='GET'){
  if(!user||!await profile(db,user))return reply({error:'Registration required'},401);
  if(await bookBlocked(env,user,url.searchParams.get('book')))return reply({error:'Book access restricted',code:'book_blocked'},403);
  const row=await one(db,'SELECT id,data FROM custom_books WHERE id=? AND published=1',url.searchParams.get('book'));
  return row?reply({id:row.id,...JSON.parse(row.data)}):reply({error:'Book unavailable'},404);
 }
 if(path==='/api/messages'&&req.method==='GET'){
  if(!user)return reply({error:'Sign in required'},401);
  const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
  const rows=(await db.prepare('SELECT id,body,kind,created,read_at AS readAt FROM reader_messages WHERE recipient=? ORDER BY created DESC,id LIMIT 30 OFFSET ?').bind(user.id,offset).all()).results;
  const counts=await one(db,'SELECT COUNT(*) AS total,SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread FROM reader_messages WHERE recipient=?',user.id);
  return reply({messages:rows,unread:counts.unread||0,total:counts.total});
 }
 if(path==='/api/messages/read'&&req.method==='POST'){
  if(!user)return reply({error:'Sign in required'},401);let d;try{const raw=await req.text();if(raw.length>500)throw Error();d=JSON.parse(raw)}catch{return reply({error:'Invalid request'},400)}
  if(typeof d.id!=='string')return reply({error:'Invalid message'},400);
  await db.prepare('UPDATE reader_messages SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient=?').bind(now,d.id,user.id).run();return reply({ok:true});
 }
 const adminPaths=['/api/admin/role','/api/admin/book-access','/api/admin/stats','/api/admin/readers','/api/admin/reader','/api/admin/adjust','/api/admin/message','/api/admin/books','/api/admin/book'];
 if(!adminPaths.includes(path))return null;
 if(!user)return reply({error:'Sign in required'},401);if(!await admin(user,env))return reply({error:'Forbidden'},403);
 if(req.method==='GET'){
  if(path==='/api/admin/stats'){
   const day=new Date(now+5*3600000).toISOString().slice(0,10);
   const stats=await one(db,'SELECT COALESCE(SUM(views),0) AS views,COUNT(DISTINCT visitor) AS visitors,MIN(day) AS since FROM site_visits');
   const today=await one(db,'SELECT COALESCE(SUM(views),0) AS views,COUNT(*) AS visitors FROM site_visits WHERE day=?',day);
   const registered=await one(db,'SELECT COUNT(*) AS count FROM reader_profiles');return reply({...stats,today,registered:registered.count});
  }
  if(path==='/api/admin/readers'){
   const q=cleanText(url.searchParams.get('q'),120),term='%'+q+'%',offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
   const where=" WHERE (p.first_name || ' ' || p.last_name || ' ' || p.middle_name) LIKE ?";
   const rows=(await db.prepare("SELECT p.user_id AS id,p.first_name AS firstName,p.last_name AS lastName,p.middle_name AS middleName,p.role,p.avatar,p.created,COALESCE(s.earned,0) AS earned,COALESCE(b.points,0) AS bonus,COALESCE(s.earned,0)+COALESCE(b.points,0) AS total,v.lastSeen FROM reader_profiles p LEFT JOIN (SELECT visitor,SUM(score) AS earned FROM quiz_scores GROUP BY visitor) s ON s.visitor='user:'||p.user_id LEFT JOIN reader_bonuses b ON b.user_id=p.user_id LEFT JOIN (SELECT user_id,MAX(last_seen) AS lastSeen FROM site_visits GROUP BY user_id) v ON v.user_id=p.user_id"+where+' ORDER BY p.created DESC,p.user_id LIMIT 30 OFFSET ?').bind(term,offset).all()).results;
   const total=await one(db,'SELECT COUNT(*) AS count FROM reader_profiles p'+where,term);const admins=(await db.prepare('SELECT user_id FROM library_admins').bind().all()).results;const owner=await one(db,'SELECT value FROM site_settings WHERE key=?','owner_id');return reply({readers:rows.map(r=>({...r,isAdmin:r.id===owner?.value||admins.some(a=>a.user_id===r.id)})),total:total.count});
  }
  if(path==='/api/admin/reader'){
   const id=url.searchParams.get('id'),p=await profile(db,{id});if(!p)return reply({error:'Reader not found'},404);
   const history=(await db.prepare('SELECT amount,reason,created FROM point_adjustments WHERE recipient=? AND applied=1 ORDER BY created DESC LIMIT 20').bind(id).all()).results;
   const sent=(await db.prepare('SELECT body,kind,created,read_at AS readAt FROM reader_messages WHERE recipient=? ORDER BY created DESC LIMIT 20').bind(id).all()).results;
   const owner=await one(db,'SELECT value FROM site_settings WHERE key=?','owner_id');const isOwnerReader=id===owner?.value;const blocks=(await db.prepare('SELECT book FROM reader_book_blocks WHERE user_id=?').bind(id).all()).results.map(r=>r.book);const added=(await db.prepare('SELECT id,data FROM custom_books').bind().all()).results.map(r=>({id:r.id,title:JSON.parse(r.data).title}));const warningCount=(await one(db,"SELECT COUNT(*) AS n FROM reader_messages WHERE recipient=? AND kind='warning'",id)).n;return reply({id,profile:p,warningCount,isOwner:isOwnerReader,isAdmin:isOwnerReader||!!await one(db,'SELECT user_id FROM library_admins WHERE user_id=?',id),blockedBooks:blocks,accessBooks:[...QUESTIONS.map(b=>({id:b.id,title:b.title})),{id:'hachiko',title:{kk:'Хачико',ru:'Хачико',en:'Hachiko'}},...added],...await progress(db,'user:'+id,{id}),history,sent});
  }
  if(path==='/api/admin/books')return reply({books:(await db.prepare('SELECT id,data,published,created,updated FROM custom_books ORDER BY created DESC').bind().all()).results.map(r=>({id:r.id,published:!!r.published,...JSON.parse(r.data)}))});
  return reply({error:'Method not allowed'},405);
 }
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 let d;try{const raw=await req.text();if(raw.length>14000)throw Error();d=JSON.parse(raw);if(!d||typeof d!=='object')throw Error()}catch{return reply({error:'Invalid request'},400)}
 if(path==='/api/admin/role'||path==='/api/admin/book-access'){
  if(typeof d.recipient!=='string'||!await profile(db,{id:d.recipient}))return reply({error:'Reader not found'},404);
  const owner=await one(db,'SELECT value FROM site_settings WHERE key=?','owner_id');
  if(path==='/api/admin/role'){
   if(typeof d.enabled!=='boolean')return reply({error:'Invalid role'},400);
   if(d.recipient===owner?.value&&!d.enabled)return reply({error:'Owner access is permanent',code:'owner_protected'},409);
   if(d.enabled)await db.prepare('INSERT INTO library_admins (user_id,granted_by,created) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(d.recipient,user.id,now).run();
   else await db.prepare('DELETE FROM library_admins WHERE user_id=?').bind(d.recipient).run();
   return reply({ok:true});
  }
  if(typeof d.book!=='string'||typeof d.blocked!=='boolean')return reply({error:'Invalid book restriction'},400);
  if(d.recipient===owner?.value||await one(db,'SELECT user_id FROM library_admins WHERE user_id=?',d.recipient))return reply({error:'Administrators have full access',code:'admin_full_access'},409);
  if(d.book!=='hachiko'&&!QUESTIONS.some(b=>b.id===d.book)&&!await one(db,'SELECT id FROM custom_books WHERE id=?',d.book))return reply({error:'Book not found'},404);
  if(d.blocked)await db.prepare('INSERT INTO reader_book_blocks (user_id,book,created,created_by) VALUES (?,?,?,?) ON CONFLICT(user_id,book) DO NOTHING').bind(d.recipient,d.book,now,user.id).run();
  else await db.prepare('DELETE FROM reader_book_blocks WHERE user_id=? AND book=?').bind(d.recipient,d.book).run();
  return reply({ok:true});
 }
 let warningFingerprint;
 if(path==='/api/admin/message'&&d.kind==='warning'){
  warningFingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([d.recipient,cleanText(d.body,2001)]))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const receipt=typeof d.requestId==='string'?await one(db,'SELECT * FROM warning_receipts WHERE id=?',d.requestId):null;
  if(receipt)return receipt.fingerprint===warningFingerprint?reply({ok:true,warningCount:receipt.warning_count,accountDeleted:!!receipt.deleted}):reply({error:'Request already used'},409);
 }
 if(path==='/api/admin/adjust'||path==='/api/admin/message'){
  if(typeof d.recipient!=='string'||!await profile(db,{id:d.recipient}))return reply({error:'Reader not found'},404);
  if(typeof d.requestId!=='string'||! /^[a-f0-9-]{36}$/.test(d.requestId))return reply({error:'Invalid request ID'},400);
  if(path==='/api/admin/message'){
   const kind=d.kind||'message';if(!['message','warning'].includes(kind))return reply({error:'Invalid message type'},400);const body=cleanText(d.body,2001);if(!body||body.length>2000)return reply({error:'Message must contain 1–2000 characters'},400);
   const old=await one(db,'SELECT recipient,body,kind FROM reader_messages WHERE id=?',d.requestId);if(old&&(old.recipient!==d.recipient||old.body!==body||old.kind!==kind))return reply({error:'Request already used'},409);
   if(kind==='warning'){
    const owner=await one(db,'SELECT value FROM site_settings WHERE key=?','owner_id');if(d.recipient===owner?.value)return reply({error:'Owner account is protected',code:'owner_protected'},409);
    const stmts=[db.prepare('INSERT INTO reader_messages (id,recipient,body,kind,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM reader_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM warning_receipts WHERE id=?) ON CONFLICT(id) DO NOTHING').bind(d.requestId,d.recipient,body,kind,now,d.recipient,d.requestId),
     db.prepare("INSERT INTO warning_receipts (id,recipient,fingerprint,warning_count,deleted,created) SELECT ?,?,?,COUNT(*),CASE WHEN COUNT(*)>=3 THEN 1 ELSE 0 END,? FROM reader_messages WHERE recipient=? AND kind='warning' HAVING EXISTS (SELECT 1 FROM reader_messages WHERE id=?) ON CONFLICT(id) DO NOTHING").bind(d.requestId,d.recipient,warningFingerprint,now,d.recipient,d.requestId),
     db.prepare('INSERT INTO profile_removals (user_id,created) SELECT recipient,? FROM warning_receipts WHERE id=? AND deleted=1 AND applied=0 ON CONFLICT(user_id) DO UPDATE SET created=excluded.created').bind(now,d.requestId)];
    for(const [table,column,value] of [['quiz_scores','visitor','user:'+d.recipient],['reader_bonuses','user_id',d.recipient],['point_adjustments','recipient',d.recipient],['reader_book_blocks','user_id',d.recipient],['library_admins','user_id',d.recipient],['reader_messages','recipient',d.recipient],['reader_profiles','user_id',d.recipient]])stmts.push(db.prepare(`DELETE FROM ${table} WHERE ${column}=? AND EXISTS (SELECT 1 FROM warning_receipts WHERE id=? AND deleted=1 AND applied=0)`).bind(value,d.requestId));
    stmts.push(db.prepare('UPDATE site_visits SET user_id=NULL WHERE user_id=? AND EXISTS (SELECT 1 FROM warning_receipts WHERE id=? AND deleted=1 AND applied=0)').bind(d.recipient,d.requestId));
    stmts.push(db.prepare('UPDATE warning_receipts SET applied=1 WHERE id=?').bind(d.requestId));
    await db.batch(stmts);const result=await one(db,'SELECT warning_count,deleted FROM warning_receipts WHERE id=?',d.requestId);return result?reply({ok:true,warningCount:result.warning_count,accountDeleted:!!result.deleted}):reply({error:'Reader not found'},404);
   }
   await db.prepare('INSERT INTO reader_messages (id,recipient,body,kind,created) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(d.requestId,d.recipient,body,kind,now).run();return reply({ok:true});
  }
  const amount=d.amount,reason=cleanText(d.reason,301);if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>10000||reason.length>300)return reply({error:'Choose 1–10000 points'},400);
  const old=await one(db,'SELECT recipient,amount,reason FROM point_adjustments WHERE id=?',d.requestId);if(old&&(old.recipient!==d.recipient||old.amount!==amount||old.reason!==reason))return reply({error:'Request already used'},409);
  // The balance check and the adjustment are committed together. A retry cannot apply it twice.
  await db.batch([
   db.prepare('INSERT INTO point_adjustments (id,recipient,amount,reason,created,applied) SELECT ?,?,?,?,?,0 WHERE (SELECT COALESCE(SUM(score),0) FROM quiz_scores WHERE visitor=?) + COALESCE((SELECT points FROM reader_bonuses WHERE user_id=?),0) + ? >= 0 ON CONFLICT(id) DO NOTHING').bind(d.requestId,d.recipient,amount,reason,now,'user:'+d.recipient,d.recipient,amount),
   db.prepare('INSERT INTO reader_bonuses (user_id,points,updated) SELECT recipient,amount,? FROM point_adjustments WHERE id=? AND applied=0 ON CONFLICT(user_id) DO UPDATE SET points=reader_bonuses.points+excluded.points,updated=excluded.updated').bind(now,d.requestId),
   db.prepare('UPDATE point_adjustments SET applied=1 WHERE id=? AND applied=0').bind(d.requestId)
  ]);
  if(!await one(db,'SELECT id FROM point_adjustments WHERE id=?',d.requestId))return reply({error:'Not enough points',code:'insufficient_points'},409);
  return reply(await progress(db,'user:'+d.recipient,{id:d.recipient}));
 }
 if(path==='/api/admin/book'){
  const book=cleanBook(d);if(!book||typeof d.published!=='boolean'||typeof d.id!=='string'||!/^book-[a-f0-9-]{36}$/.test(d.id))return reply({error:'Check titles, author and HTTPS links'},400);
  await db.prepare('INSERT INTO custom_books (id,data,published,created,updated) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,published=excluded.published,updated=excluded.updated').bind(d.id,JSON.stringify(book),d.published?1:0,now,now).run();return reply({id:d.id,...book,published:d.published});
 }
 return reply({error:'Method not allowed'},405);
}
