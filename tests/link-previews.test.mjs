import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../src/scripts/link-previews.js', import.meta.url),'utf8').replace("import previews from '../data/link-previews.json';",'');
const timers=new Map();let now=0,id=0;const events={};
const listen=(target,name,fn)=>((target[name]??=[]).push(fn));
class Element {
 constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.hidden=false;this.textContent='';this.style={};this.events={};this.isConnected=true;this.focusVisible=false;}
 append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}}
 setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k]??null;} removeAttribute(k){delete this.attrs[k];} hasAttribute(k){return k in this.attrs;}
 addEventListener(name,fn){listen(this.events,name,fn);}
 contains(node){return node===this || this.children.some(child=>child.contains(node));}
 closest(){return this.tag==='a'?this:this.parent?.closest()??null;}
 querySelector(){return null;}
 matches(){return this.focusVisible;}
 getBoundingClientRect(){return this.tag==='a'?{left:780,top:600,bottom:620}:{width:360,height:320};}
}
const body=new Element('body');
const document={body,activeElement:null,createElement:tag=>new Element(tag),querySelector:()=>({href:'https://anandmohanan.com/'}),addEventListener:(name,fn)=>listen(events,name,fn)};
const hover={matches:true};
const window={matchMedia:()=>hover,addEventListener:()=>{}};
const context={previews:{'https://example.com/':{title:'Example',description:'A useful page',image:'/link-previews/example.png'}},document,window,Element,URL,location:{href:'https://anandmohanan.com/',origin:'https://anandmohanan.com',pathname:'/',search:''},innerWidth:1000,innerHeight:700,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:n=>timers.delete(n)};
runInNewContext(source,context);
const popup=body.children[0],image=popup.children[0];
const dispatch=(name,event)=>{for(const fn of events[name]??[])fn(event);};
const tick=ms=>{now+=ms;for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.fn();}};
const link=href=>{const a=new Element('a');a.setAttribute('href',href);a.textContent='Link label';return a;};
const a=link('https://example.com/');
dispatch('pointerover',{target:a,relatedTarget:null,pointerType:'mouse'});tick(179);assert.equal(popup.hidden,true);tick(1);assert.equal(popup.hidden,false);assert.equal(image.src,'/link-previews/example.png');image.onload();assert.equal(image.hidden,false);assert.equal(popup.style.left,'628px');assert.equal(popup.style.top,'268px');
dispatch('pointerout',{target:a,relatedTarget:body});for(const fn of popup.events.pointerenter)fn();tick(300);assert.equal(popup.hidden,false,'Hovering the preview keeps it open');for(const fn of popup.events.pointerleave)fn();assert.equal(popup.hidden,true);
a.setAttribute('aria-describedby','existing-description');a.focusVisible=true;document.activeElement=a;dispatch('focusin',{target:a});dispatch('scroll',{});tick(0);assert.equal(popup.hidden,false,'Focus survives automatic scrolling');dispatch('keydown',{key:'Escape'});assert.equal(popup.hidden,true);assert.equal(a.getAttribute('aria-describedby'),'existing-description');
document.activeElement=null;dispatch('pointerover',{target:a,relatedTarget:null,pointerType:'touch'});tick(500);assert.equal(popup.hidden,true,'Touch does not open previews');
for(const href of ['#skills','mailto:hi@example.com','/rss.xml','/','http://[']){dispatch('pointerover',{target:link(href),relatedTarget:null,pointerType:'mouse'});tick(500);assert.equal(popup.hidden,true,href);}
dispatch('pointerout',{target:body,relatedTarget:null});
const unknown=link('https://unknown.example/');dispatch('pointerover',{target:unknown,relatedTarget:null,pointerType:'mouse'});tick(180);assert.equal(popup.hidden,false);assert.equal(image.hidden,true,'No broken image for uncached link');assert.equal(popup.children[1].children[0].textContent,'Link label');
assert.equal(events.click,undefined,'Clicks and navigation are not intercepted');
console.log('Passed: hover delay, card hover, keyboard focus/scroll, Escape, viewport positioning, touch, URL exclusions, text fallback, and ordinary navigation.');
