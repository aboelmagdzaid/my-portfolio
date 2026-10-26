(function(){
var U="https://nicsznqukjjqwkdkuije.supabase.co",K="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pY3N6bnF1a2pqcXdrZGt1aWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NzA4NTYsImV4cCI6MjEwODU0Njg1Nn0.v6kkYNxSPs8J7P4JnwlKWQvQiD44DgXpbL5fQkHwdgI",ADMIN="aamtechco@gmail.com";
var sb=supabase.createClient(U,K),$=function(i){return document.getElementById(i)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function msg(el,t,g){el.textContent=t;el.style.color=g?'#3ddc97':'#ff8a8a'}
function show(a){$('login').hidden=a;$('dash').hidden=!a;$('out').hidden=!a}
async function check(){var r=await sb.auth.getSession(),s=r.data.session;
 if(s&&s.user.email===ADMIN){show(true);load();loadSv()}else{show(false);if(s)await sb.auth.signOut()}}
$('lf').addEventListener('submit',async function(e){e.preventDefault();
 var r=await sb.auth.signInWithPassword({email:$('em').value.trim(),password:$('pw').value});
 if(r.error){msg($('lm'),'البريد أو كلمة المرور غير صحيحة',0);return}check()});
$('out').addEventListener('click',async function(e){e.preventDefault();await sb.auth.signOut();show(false)});
function sect(){var c=$('cat').value;document.querySelectorAll('[data-for]').forEach(function(x){x.hidden=x.getAttribute('data-for')!==c})}
$('cat').addEventListener('change',sect);
function addRow(){var r=document.createElement('div');r.className='row';
 r.innerHTML='<input type="file" accept="image/*"><textarea placeholder="تفاصيل هذه الصورة" style="min-height:80px"></textarea><button type="button" class="btn2 del">حذف الصورة</button>';
 r.querySelector('.del').onclick=function(){r.remove()};$('rows').appendChild(r)}
$('add').addEventListener('click',addRow);addRow();
function up(file){return new Promise(function(res,rej){var img=new Image();
 img.onload=function(){var s=Math.min(1,1800/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  c.toBlob(async function(bl){var p=crypto.randomUUID()+'.jpg',r=await sb.storage.from('work-images').upload(p,bl,{contentType:'image/jpeg'});
   if(r.error)return rej(r.error);res(sb.storage.from('work-images').getPublicUrl(p).data.publicUrl)},'image/jpeg',.86)};
 img.onerror=function(){rej(new Error('ملف الصورة غير صالح'))};img.src=URL.createObjectURL(file)})}
$('af').addEventListener('submit',async function(e){e.preventDefault();var b=$('sb');b.disabled=true;msg($('am'),'جاري الحفظ...',1);
 try{
  var cat=$('cat').value,row={category:cat,title:$('t').value.trim(),description:$('d').value.trim()||null},ph=[];
  if(cat==='video'){var u=$('vu').value.trim();if(!/^https?:\/\//i.test(u))throw new Error('رابط Google Drive غير صحيح');row.url=u}
  if(cat==='development'){var s=$('su').value.trim();if(!/^https?:\/\//i.test(s))throw new Error('رابط الموقع غير صحيح');row.url=s;var f=$('sc').files[0];if(f)row.cover_url=await up(f)}
  if(cat==='accounting'){var rs=$('rows').children;
   for(var i=0;i<rs.length;i++){var fl=rs[i].querySelector('input').files[0];if(!fl)continue;
    ph.push({image_url:await up(fl),details:rs[i].querySelector('textarea').value.trim()||null,sort:i})}
   if(!ph.length)throw new Error('أضف صورة واحدة على الأقل');row.cover_url=ph[0].image_url}
  var r=await sb.from('works').insert(row).select().single();if(r.error)throw r.error;
  if(ph.length){ph.forEach(function(p){p.work_id=r.data.id});var r2=await sb.from('work_photos').insert(ph);if(r2.error)throw r2.error}
  $('af').reset();$('rows').innerHTML='';addRow();sect();msg($('am'),'تم الحفظ، وسيظهر العمل في الموقع الآن',1);load();
 }catch(err){msg($('am'),err.message||'حدث خطأ أثناء الحفظ',0)}
 b.disabled=false});
var N={video:'المونتاج',accounting:'المحاسبة',development:'البرمجة'};
async function load(){var r=await sb.from('works').select('*').order('sort').order('created_at',{ascending:false}),h='';
 if(r.error){$('list').textContent='تعذر التحميل';return}
 Object.keys(N).forEach(function(c){var it=r.data.filter(function(w){return w.category===c});
  h+='<h3>'+N[c]+' ('+it.length+')</h3>'+(it.map(function(w){return '<div class="item"><div><b>'+esc(w.title)+'</b><small>'+esc(w.url||'')+'</small></div><button class="btn2 del" data-id="'+w.id+'">حذف</button></div>'}).join('')||'<p style="color:#93a1c0">لا توجد أعمال بعد.</p>')});
 $('list').innerHTML=h}
$('list').addEventListener('click',async function(e){var id=e.target.getAttribute&&e.target.getAttribute('data-id');if(!id)return;
 if(!confirm('هل تريد حذف هذا العمل نهائيًا؟'))return;
 var ps=await sb.from('work_photos').select('image_url').eq('work_id',id),w=await sb.from('works').select('cover_url').eq('id',id).single();
 var paths=(ps.data||[]).map(function(p){return p.image_url}).concat(w.data&&w.data.cover_url?[w.data.cover_url]:[]).map(function(u){var i=u.indexOf('/work-images/');return i>-1?u.slice(i+13):null}).filter(Boolean);
 var r=await sb.from('works').delete().eq('id',id);if(r.error){alert('تعذر الحذف');return}
 if(paths.length)await sb.storage.from('work-images').remove(paths);load()});

async function loadSv(){var c=$('sc2').value,r=await sb.from('services').select('*').eq('category',c).order('sort').order('created_at');
 if(r.error){$('svl').textContent='تعذر التحميل';return}
 $('svl').innerHTML=r.data.map(function(s){return '<div class="row" data-id="'+s.id+'"><input class="st" value="'+esc(s.title)+'"><textarea class="sd" style="min-height:70px">'+esc(s.description)+'</textarea><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label style="margin:0">الترتيب</label><input class="so" type="number" value="'+s.sort+'" style="width:90px"><button type="button" class="btn2" data-act="save">حفظ</button><button type="button" class="btn2 del" data-act="del">حذف</button></div></div>'}).join('')||'<p style="color:#93a1c0">لا توجد خدمات.</p>'}
$('sc2').addEventListener('change',loadSv);
$('svl').addEventListener('click',async function(e){var act=e.target.getAttribute&&e.target.getAttribute('data-act');if(!act)return;
 var row=e.target.closest('.row'),id=row.getAttribute('data-id');
 if(act==='del'){if(!confirm('حذف هذه الخدمة؟'))return;var r=await sb.from('services').delete().eq('id',id);msg($('sm'),r.error?'تعذر الحذف':'تم الحذف',!r.error);loadSv();return}
 var r2=await sb.from('services').update({title:row.querySelector('.st').value.trim(),description:row.querySelector('.sd').value.trim()||null,sort:parseInt(row.querySelector('.so').value,10)||0}).eq('id',id);
 msg($('sm'),r2.error?'تعذر الحفظ':'تم حفظ التعديل',!r2.error);loadSv()});
$('na').addEventListener('click',async function(){var t=$('nt').value.trim();if(!t){msg($('sm'),'اكتب عنوان الخدمة',0);return}
 var c=$('sc2').value,last=await sb.from('services').select('sort').eq('category',c).order('sort',{ascending:false}).limit(1),n=last.data&&last.data.length?last.data[0].sort+1:0;
 var r=await sb.from('services').insert({category:c,title:t,description:$('nd').value.trim()||null,sort:n});
 if(r.error){msg($('sm'),'تعذرت الإضافة',0);return}$('nt').value='';$('nd').value='';msg($('sm'),'تمت إضافة الخدمة',1);loadSv()});
check();
})();
