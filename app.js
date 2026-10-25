(function(){
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
 setTimeout(function(){intro.classList.add('done');go()},1900);
 setTimeout(function(){d.documentElement.classList.remove('intro-on')},3000);
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
d.querySelectorAll('a.card').forEach(function(c){
 c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect();
  var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
  c.style.transform='perspective(800px) rotateY('+(x*10)+'deg) rotateX('+(-y*10)+'deg) translateY(-6px)'});
 c.addEventListener('mouseleave',function(){c.style.transform=''})});
})();
