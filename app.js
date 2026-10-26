(function(){
var CFG={email:"",whatsapp:""}; // add your email and WhatsApp number (with country code, digits only)
var d=document,b=d.body;
d.querySelectorAll('[data-split]').forEach(function(el){var i=0;
 (function walk(n){Array.prototype.slice.call(n.childNodes).forEach(function(c){
  if(c.nodeType===3){var f=d.createDocumentFragment();c.textContent.split(/(\s+)/).forEach(function(t){
   if(!t.trim()){f.appendChild(d.createTextNode(t));return}
   var s=d.createElement('span');s.className='w';s.style.setProperty('--i',i++);s.textContent=t;f.appendChild(s)});
   c.parentNode.replaceChild(f,c)}
  else if(c.nodeName!=='BR')walk(c)})})(el)});
var intro=d.getElementById('intro');
function go(){b.classList.add('go')}
if(intro&&d.documentElement.classList.contains('intro-on')){
 setTimeout(function(){intro.classList.add('done');setTimeout(go,350)},3300);
 setTimeout(function(){d.documentElement.classList.remove('intro-on')},4800);
}else go();
try{sessionStorage.setItem('seen','1')}catch(e){}
var els=d.querySelectorAll('.rv');
if('IntersectionObserver' in window){
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});
 els.forEach(function(e){io.observe(e)});
}else els.forEach(function(e){e.classList.add('in')});
var hero=d.querySelector('.hero');
if(hero)hero.addEventListener('mousemove',function(e){var r=hero.getBoundingClientRect();
 hero.style.setProperty('--mx',(e.clientX-r.left)+'px');hero.style.setProperty('--my',(e.clientY-r.top)+'px')});
d.querySelectorAll('.btn').forEach(function(c){
 c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect();
  c.style.transform='translate('+((e.clientX-r.left-r.width/2)*.2)+'px,'+((e.clientY-r.top-r.height/2)*.3)+'px)'});
 c.addEventListener('mouseleave',function(){c.style.transform=''})});
d.querySelectorAll('a.card').forEach(function(c){
 c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect();
  var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
  c.style.transform='perspective(900px) rotateY('+(x*8)+'deg) rotateX('+(-y*8)+'deg) translateY(-5px)'});
 c.addEventListener('mouseleave',function(){c.style.transform=''})});
// scroll bar + hide nav
var bar=d.querySelector('.bar'),nv=d.querySelector('nav'),ly=0;
addEventListener('scroll',function(){var y=scrollY,h=d.documentElement.scrollHeight-innerHeight;
 if(bar)bar.style.width=(h>0?y/h*100:0)+'%';
 if(nv){nv.classList.toggle('hide',y>ly&&y>200);}ly=y},{passive:true});
// cursor
var cu=d.querySelector('.cur'),cr=d.querySelector('.cur-r'),px=0,py=0,rx=0,ry=0;
if(cu&&matchMedia('(pointer:fine)').matches){
 addEventListener('mousemove',function(e){px=e.clientX;py=e.clientY;cu.style.transform='translate('+px+'px,'+py+'px)'});
 (function t(){rx+=(px-rx)*.16;ry+=(py-ry)*.16;cr.style.transform='translate('+rx+'px,'+ry+'px)';requestAnimationFrame(t)})();
 d.querySelectorAll('a,button').forEach(function(a){a.addEventListener('mouseenter',function(){cr.classList.add('big')});a.addEventListener('mouseleave',function(){cr.classList.remove('big')})});
}
// contact
d.querySelectorAll('[data-c]').forEach(function(a){var k=a.getAttribute('data-c'),v=CFG[k];
 if(!v)return;
 if(k==='email'){a.href='mailto:'+v;a.textContent=v}else{a.href='https://wa.me/'+v;a.textContent='+'+v}});
var f=d.getElementById('cf');
if(f)f.addEventListener('submit',function(e){e.preventDefault();
 var v=function(n){return f.elements[n].value.trim()};
 var msg='مرحبًا أحمد، أنا '+v('name')+'\nالخدمة: '+v('svc')+'\n'+v('msg');
 if(CFG.whatsapp)location.href='https://wa.me/'+CFG.whatsapp+'?text='+encodeURIComponent(msg);
 else if(CFG.email)location.href='mailto:'+CFG.email+'?subject='+encodeURIComponent('طلب خدمة: '+v('svc'))+'&body='+encodeURIComponent(msg);
 else f.querySelector('.note').textContent='سيتم تفعيل وسائل التواصل قريبًا. شكرًا لصبرك.';});
})();
