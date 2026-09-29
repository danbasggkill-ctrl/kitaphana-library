const cookieName='library_reader';
function visitor(req){const value=req.headers.get('cookie')?.match(/(?:^|;\s*)library_reader=([a-f0-9-]{36})(?:;|$)/)?.[1];return value||crypto.randomUUID();}
function identity(req){const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');return id&&email?{id,email}:null}
function isOwner(user,env){return !!(user&&env.LIBRARY_ADMIN_EMAIL&&user.email?.toLowerCase()===env.LIBRARY_ADMIN_EMAIL.toLowerCase())}
async function admin(user,env){return isOwner(user,env)||!!(user&&env.DB&&await one(env.DB,'SELECT user_id FROM library_admins WHERE user_id=?',user.id))}
async function bookBlocked(env,user,book){return !!(user&&!await admin(user,env)&&await one(env.DB,'SELECT book FROM reader_book_blocks WHERE user_id=? AND book=?',user.id,book))}
function namePart(v){return typeof v==='string'?v.normalize('NFKC').trim().replace(/\s+/gu,' '):''}
function fullNameKey(first,last,middle){return [last,first,middle].map(x=>namePart(x).toLowerCase()).join('|')}

function reply(data,status=200,id){const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};if(id)h['Set-Cookie']=`${cookieName}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;return new Response(JSON.stringify(data),{status,headers:h});}
async function one(db,sql,...args){return (await db.prepare(sql).bind(...args).all()).results[0]||null}
async function profile(db,user){return user?one(db,'SELECT first_name AS firstName, last_name AS lastName, middle_name AS middleName, gender, avatar, role FROM reader_profiles WHERE user_id = ?',user.id):null}
async function progress(db,id,user){const rows=(await db.prepare('SELECT book, score FROM quiz_scores WHERE visitor = ?').bind(id).all()).results;const scores=Object.fromEntries(rows.map(r=>[r.book,r.score]));const earned=Object.values(scores).reduce((a,b)=>a+b,0);const bonus=user?(await one(db,'SELECT points FROM reader_bonuses WHERE user_id = ?',user.id))?.points||0:0;const total=earned+bonus;return {scores,total,earned,bonus,threshold:240,maxTotal:280,unlocked:total>=240};}
const avatars=['student-male','student-female','teacher-male','teacher-female'];
function signIn(path){return '/signin-with-chatgpt?return_to='+encodeURIComponent(path)}
export default {async fetch(req,env){const url=new URL(req.url),path=url.pathname,user=identity(req);try{
 if(path==='/book.html'&&(!user||!env.DB||!await profile(env.DB,user)))return new Response(null,{status:302,headers:{Location:'/?register=1','Cache-Control':'no-store'}});
 if(path==='/messages.html'&&!user)return new Response(null,{status:302,headers:{Location:signIn('/messages.html'),'Cache-Control':'no-store'}});
 if(path==='/profile.html'&&!user)return new Response(null,{status:302,headers:{Location:signIn('/profile.html'),'Cache-Control':'no-store'}});
 if(path==='/admin.html'&&!user)return new Response(null,{status:302,headers:{Location:signIn('/admin.html'),'Cache-Control':'no-store'}});
 if(path==='/admin.html'&&!await admin(user,env))return new Response('<!doctype html><meta charset="utf-8"><h1>Доступ запрещён</h1><p>Бұл бөлім тек әкімшіге қолжетімді. This page is for the administrator only.</p><a href="/">Кітапхана / Библиотека</a>',{status:403,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 if(path.startsWith('/api/')||path==='/reward'||path==='/read'){
  const guest=visitor(req);if(!env.DB)return reply({error:'Storage unavailable'},503);
  if(req.method==='POST'&&req.headers.get('Origin')!==url.origin)return reply({error:'Origin mismatch'},403,guest);
  const managed=await managedApi(req,env,user,guest,url);if(managed)return managed;
  if(path==='/api/settings'&&req.method==='GET'){const row=await one(env.DB,'SELECT value FROM site_settings WHERE key = ?','background');return reply({background:row&&/^#[0-9a-f]{6}$/i.test(row.value)?row.value:'#f6f4ee'})}
  if(path==='/api/account'&&req.method==='GET'){if(isOwner(user,env))await env.DB.prepare('INSERT INTO site_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('owner_id',user.id).run();return reply({signedIn:!!user,readerId:user?.id||null,profile:await profile(env.DB,user),profileDeleted:!!(user&&await one(env.DB,'SELECT user_id FROM profile_removals WHERE user_id=?',user.id)),isAdmin:await admin(user,env),signIn:signIn('/profile.html'),signOut:'/signout-with-chatgpt?return_to=%2F'},200,guest);}
  if(path.startsWith('/api/admin/')){
   if(!user)return reply({error:'Sign in required'},401,guest);if(!await admin(user,env))return reply({error:'Forbidden'},403,guest);if(req.method!=='POST')return reply({error:'Method not allowed'},405,guest);
   let d;try{const raw=await req.text();if(raw.length>2000)throw Error();d=JSON.parse(raw)}catch{return reply({error:'Invalid request'},400,guest)}
   if(path==='/api/admin/points'){if(!Number.isInteger(d.amount)||d.amount<1||d.amount>10000)return reply({error:'Choose 1–10000 points'},400,guest);if(!(await profile(env.DB,user)))return reply({error:'Create a profile first'},409,guest);await env.DB.prepare('INSERT INTO reader_bonuses (user_id, points, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET points = reader_bonuses.points + excluded.points, updated = excluded.updated').bind(user.id,d.amount,Date.now()).run();return reply(await progress(env.DB,'user:'+user.id,user),200,guest)}
   if(path==='/api/admin/background'){if(typeof d.color!=='string'||!/^#[0-9a-f]{6}$/i.test(d.color))return reply({error:'Invalid color'},400,guest);await env.DB.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('background',d.color.toLowerCase()).run();return reply({background:d.color.toLowerCase()},200,guest)}
   return reply({error:'Not found'},404,guest);
  }
  if(path==='/api/profile'&&req.method==='POST'){
   if(!user)return reply({error:'Sign in required'},401,guest);let d;try{const raw=await req.text();if(raw.length>4000)throw Error();d=JSON.parse(raw)}catch{return reply({error:'Invalid request'},400,guest)}
   const first=namePart(d.firstName),last=namePart(d.lastName),middle=namePart(d.middleName);const nameKey=fullNameKey(first,last,middle);
   if(!first||!last||first.length>60||last.length>60||middle.length>60||/[\u0000-\u001f<>]/.test(first+last+middle)||!['male','female','unspecified'].includes(d.gender)||!avatars.includes(d.avatar))return reply({error:'Check your name, surname, gender and avatar'},400,guest);
   const names=(await env.DB.prepare('SELECT user_id,first_name,last_name,middle_name FROM reader_profiles WHERE user_id<>?').bind(user.id).all()).results;if(names.some(p=>fullNameKey(p.first_name,p.last_name,p.middle_name)===nameKey))return reply({error:'Full name is already registered',code:'name_taken'},409,guest);
   const role=d.role||'student';if(!['student','teacher'].includes(role))return reply({error:'Invalid role'},400,guest);const existing=await profile(env.DB,user),now=Date.now();const stmts=[env.DB.prepare('INSERT INTO reader_profiles (user_id, first_name, last_name, middle_name, name_key, gender, avatar, role, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, middle_name=excluded.middle_name, name_key=excluded.name_key, gender=excluded.gender, avatar=excluded.avatar, role=excluded.role, updated=excluded.updated').bind(user.id,first,last,middle,nameKey,d.gender,d.avatar,role,now,now)];
   const removed=await one(env.DB,'SELECT user_id FROM profile_removals WHERE user_id=?',user.id);if(!existing&&!removed){stmts.push(env.DB.prepare('INSERT INTO quiz_scores (visitor, book, score, updated) SELECT ?, book, score, updated FROM quiz_scores WHERE visitor = ? ON CONFLICT(visitor, book) DO UPDATE SET score = MAX(quiz_scores.score, excluded.score)').bind('user:'+user.id,guest));stmts.push(env.DB.prepare('DELETE FROM quiz_scores WHERE visitor = ?').bind(guest))}
   if(removed){stmts.push(env.DB.prepare('DELETE FROM quiz_scores WHERE visitor=?').bind(guest));stmts.push(env.DB.prepare('DELETE FROM profile_removals WHERE user_id=?').bind(user.id))}
   try{await env.DB.batch(stmts)}catch(e){if(String(e).includes('reader_profiles.name_key'))return reply({error:'Full name is already registered',code:'name_taken'},409,guest);throw e}return reply({profile:{firstName:first,lastName:last,middleName:middle,gender:d.gender,avatar:d.avatar,role},isAdmin:await admin(user,env)},200,guest);
  }
  const reader=await profile(env.DB,user),id=reader?'user:'+user.id:guest;
  if((path==='/read'||path==='/reward')&&!reader)return new Response(null,{status:302,headers:{Location:'/?register=1','Cache-Control':'no-store'}});
  if((path==='/read'||path==='/reward')&&await bookBlocked(env,user,path==='/reward'?'hachiko':url.searchParams.get('book')))return new Response(null,{status:302,headers:{Location:'/blocked.html','Cache-Control':'no-store'}});
  if(path==='/read'){const book=QUESTIONS.find(b=>b.id===url.searchParams.get('book'));if(!book)return reply({error:'Unknown book'},404);return new Response(null,{status:302,headers:{Location:book.url,'Cache-Control':'no-store'}})}
  if(path==='/api/progress'&&req.method==='GET'){const p=await progress(env.DB,id,reader?user:null);return reply({...p,unlocked:p.unlocked||await admin(user,env),registered:!!reader},200,guest);}
  if(path==='/api/quiz'&&req.method==='GET'){if(await bookBlocked(env,user,url.searchParams.get('book')))return reply({error:'Book access restricted',code:'book_blocked'},403);const book=QUESTIONS.find(b=>b.id===url.searchParams.get('book'));if(!book)return reply({error:'Unknown book'},404,guest);return reply({id:book.id,title:book.title,url:book.url,questions:book.questions.map(({answer,...q})=>q)},200,guest)}
  if(path==='/api/quiz'&&req.method==='POST'){
   if(!user)return reply({error:'Sign in required'},401,guest);if(!reader)return reply({error:'Create a profile first'},409,guest);
   const raw=await req.text();if(raw.length>4000)return reply({error:'Request too large'},413,guest);let data;try{data=JSON.parse(raw)}catch{return reply({error:'Invalid JSON'},400,guest)}
   if(await bookBlocked(env,user,data.book))return reply({error:'Book access restricted',code:'book_blocked'},403);const book=QUESTIONS.find(b=>b.id===data.book);if(!book||!Array.isArray(data.answers)||data.answers.length!==4||data.answers.some(a=>!Number.isInteger(a)||a<0||a>2))return reply({error:'Answer all four questions'},400,guest);
   const correct=book.questions.map((q,i)=>q.answer===data.answers[i]);const score=correct.filter(Boolean).length*5;
   await env.DB.prepare('INSERT INTO quiz_scores (visitor, book, score, updated) VALUES (?, ?, ?, ?) ON CONFLICT(visitor, book) DO UPDATE SET score = MAX(quiz_scores.score, excluded.score), updated = excluded.updated').bind(id,book.id,score,Date.now()).run();
   const p=await progress(env.DB,id,user);return reply({score,correct,answers:book.questions.map(q=>q.answer),...p,unlocked:p.unlocked||await admin(user,env),registered:true},200,guest);
  }
  if(path==='/reward'&&req.method==='GET'){const p=await progress(env.DB,id,reader?user:null);return new Response(null,{status:302,headers:{Location:p.unlocked||await admin(user,env)?'https://danbasggkill-ctrl.github.io/hachiko-sitee/':'/quiz.html?locked=1','Cache-Control':'no-store','Set-Cookie':`${cookieName}=${guest}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`}})}
  return reply({error:'Not found'},404,guest);
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method not allowed',{status:405});
 const key=path==='/'||path==='/index.html'?'/index.html':path;const asset=ASSETS[key];if(!asset)return new Response('Not found',{status:404});const body=asset.base64?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;return new Response(req.method==='HEAD'?null:body,{headers:{'Content-Type':asset.type,'Cache-Control':asset.base64?'public, max-age=3600':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){console.error('Library request failed',e);return reply({error:'Unable to load or save. Please retry.'},503)}}};
