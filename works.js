(function(){
var U="https://nicsznqukjjqwkdkuije.supabase.co",K="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pY3N6bnF1a2pqcXdrZGt1aWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NzA4NTYsImV4cCI6MjEwODU0Njg1Nn0.v6kkYNxSPs8J7P4JnwlKWQvQiD44DgXpbL5fQkHwdgI",d=document;
var box=d.getElementById('works'),pj=d.getElementById('project');
if(!box&&!pj)return;
function q(p){return fetch(U+'/rest/v1/'+p,{headers:{apikey:K,Authorization:'Bearer '+K}}).then(function(r){if(!r.ok)throw 0;return r.json()})}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function ok(u){return /^https?:\/\//i.test(u||'')?u:''}
function did(u){var m=String(u||'').match(/\/d\/([\w-]+)/)||String(u||'').match(/[?&]id=([\w-]+)/);return m&&m[1]}
function shot(u){return 'https://s.wordpress.com/mshots/v1/'+encodeURIComponent(u)+'?w=1200&h=800'}
function host(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return u}}
function empty(t){return '<div class="empty pop" style="grid-column:1/-1"><h3>'+t+'</h3><p>سيتم عرض الأعمال هنا قريبًا.</p></div>'}
function fail(){(box||pj).innerHTML=empty('تعذر التحميل')}
if(box){
 var cat=box.getAttribute('data-cat');
 box.innerHTML='<p style="grid-column:1/-1;text-align:center;color:#93a1c0">جاري التحميل...</p>';
 var pr=[q('works?category=eq.'+cat+'&select=*&order=sort.asc,created_at.desc')];
 if(cat==='accounting')pr.push(q('work_photos?select=work_id,image_url&order=sort.asc'));
 Promise.all(pr).then(function(r){
  var ws=r[0],ph=r[1]||[],map={};
  ph.forEach(function(p){(map[p.work_id]=map[p.work_id]||[]).push(p.image_url)});
  if(!ws.length){box.innerHTML=empty('قيد التجهيز');return}
  box.innerHTML=ws.map(function(w,i){
   var t=esc(w.title),ds=esc(w.description),dl=' style="--d:'+i+'"';
   if(cat==='development'){var u=ok(w.url),im=ok(w.cover_url)||(u?shot(u):'');
    return '<a class="card site pop"'+dl+' href="'+esc(u)+'" target="_blank" rel="noopener"><div class="bw"><i></i><i></i><i></i><u>'+esc(host(u))+'</u></div><div class="shot"><img loading="lazy" alt="'+t+'" src="'+esc(im)+'"></div><div class="bd"><span class="tg">موقع إلكتروني</span><h3>'+t+'</h3><p>'+ds+'</p><span class="more">زيارة الموقع ↗</span></div></a>'}
   if(cat==='video'){var id=did(w.url),u2=ok(w.url);
    return '<div class="card site pop"'+dl+'>'+(id?'<div class="vid"><iframe loading="lazy" allow="autoplay; fullscreen" allowfullscreen src="https://drive.google.com/file/d/'+id+'/preview"></iframe></div>':'')+'<div class="bd"><span class="tg">فيديو</span><h3>'+t+'</h3><p>'+ds+'</p>'+(u2?'<a class="more" href="'+esc(u2)+'" target="_blank" rel="noopener">فتح في Google Drive ↗</a>':'')+'</div></div>'}
   var ims=map[w.id]||[],cv=ok(w.cover_url)||ims[0]||'';
   return '<a class="card site pop"'+dl+' href="project.html?id='+esc(w.id)+'">'+(cv?'<div class="shot"><img loading="lazy" alt="'+t+'" src="'+esc(cv)+'"></div>':'')+'<div class="bd"><span class="tg">'+ims.length+' صور</span><h3>'+t+'</h3><p>'+ds+'</p><span class="more">عرض التفاصيل ←</span></div></a>'
  }).join('');
 }).catch(fail);
}
if(pj){
 var id=new URLSearchParams(location.search).get('id')||'';
 if(!/^[0-9a-f-]{36}$/i.test(id)){pj.innerHTML=empty('المشروع غير موجود');return}
 Promise.all([q('works?id=eq.'+id+'&select=*'),q('work_photos?work_id=eq.'+id+'&order=sort.asc,created_at.asc')]).then(function(r){
  var w=r[0][0];if(!w){pj.innerHTML=empty('المشروع غير موجود');return}
  d.title=w.title+' | أحمد أبو المجد زيد';
  d.getElementById('ph1').textContent=w.title;d.getElementById('pd').textContent=w.description||'';
  pj.innerHTML=r[1].map(function(p,i){
   return '<div class="ph pop" style="--d:'+(i%3)+'"><a class="pi" href="'+esc(ok(p.image_url))+'" target="_blank" rel="noopener"><img loading="lazy" alt="" src="'+esc(ok(p.image_url))+'"></a><div class="pt"><span class="num">'+String(i+1).padStart(2,'0')+'</span><p>'+esc(p.details).replace(/\n/g,'<br>')+'</p></div></div>'}).join('')||empty('لا توجد صور');
 }).catch(fail);
}
})();
