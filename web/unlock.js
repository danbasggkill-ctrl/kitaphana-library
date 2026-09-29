(()=>{
const texts={kk:{badge:'240 ҰПАЙ · ЖАҢА КІТАП',title:'«Хачико» ашылды!',sub:'Сіз мақсатқа жеттіңіз. Адалдық туралы оқиға сізді күтеді.',open:'«Хачиконы» ашу',later:'Кейінірек',author:'Лесли Ньюман'},ru:{badge:'240 БАЛЛОВ · НОВАЯ КНИГА',title:'«Хачико» открыт!',sub:'Ты достиг цели. История о верности уже ждёт тебя.',open:'Открыть «Хачико»',later:'Позже',author:'Лесли Ньюман'},en:{badge:'240 POINTS · NEW BOOK',title:'Hachiko unlocked!',sub:'You reached your goal. A story of loyalty is waiting for you.',open:'Open Hachiko',later:'Later',author:'Lesléa Newman'}};
let pending=false,shown=new Set();
window.checkLibraryUnlock=async progress=>{
 if(!progress?.unlocked||progress.total<240||pending)return;
 let a;try{a=window.currentLibraryAccount||await window.libraryAccount}catch{return}
 if(!a?.profile||!a.readerId)return;
 const key='library-hachiko-reveal-v1:'+a.readerId;
 let seen=shown.has(key);try{seen=seen||localStorage.getItem(key)==='seen'}catch{}
 if(seen||pending)return;pending=true;
 // Let a registration greeting finish before showing the reward.
 const show=()=>{if(document.querySelector('dialog[open]')){setTimeout(show,400);return}
 const t=texts[document.documentElement.lang]||texts.kk,prior=document.activeElement,previousOverflow=document.body.style.overflow;
 const d=document.createElement('dialog');d.className='hachiko-reveal';d.setAttribute('aria-labelledby','hachiko-reveal-title');
 d.innerHTML=`<div class="unlock-rays" aria-hidden="true"></div><div class="unlock-content"><p class="unlock-eyebrow">${t.badge}</p><div class="unlock-stage"><div class="unlock-book"><img src="/hachiko-cover.webp" alt="${t.author} — Хачико"><div class="unlock-seal" aria-hidden="true"><svg viewBox="0 0 64 76" width="64" height="76"><path class="unlock-shackle" d="M18 33V20a14 14 0 0 1 28 0v13" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><rect x="8" y="31" width="48" height="38" rx="8" fill="currentColor"/><circle cx="32" cy="46" r="5" fill="#173a30"/><path d="M32 48v9" stroke="#173a30" stroke-width="5"/></svg></div></div><div class="unlock-ring" aria-hidden="true"></div></div><h1 id="hachiko-reveal-title">${t.title}</h1><p class="unlock-description">${t.sub}</p><div class="unlock-actions"><a href="/reward">${t.open}</a><button type="button">${t.later}</button></div></div>`;
 const sparks=document.createElement('div');sparks.className='unlock-sparks';sparks.setAttribute('aria-hidden','true');for(let i=0;i<48;i++){const spark=document.createElement('i');spark.style.cssText=`--angle:${i*7.5}deg;--distance:${160+Math.random()*240}px;--delay:${1.4+Math.random()*.5}s`;sparks.append(spark)}d.append(sparks);
 d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>{d.remove();document.body.style.overflow=previousOverflow;pending=false;prior?.focus()},{once:true});
 document.body.append(d);document.body.style.overflow='hidden';d.showModal();shown.add(key);try{localStorage.setItem(key,'seen')}catch{}
 };setTimeout(show,350);
};
})();
