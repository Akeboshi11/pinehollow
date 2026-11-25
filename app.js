const select = selector => document.querySelector(selector);
const selectAll = selector => [...document.querySelectorAll(selector)];
const clamp = value => Math.min(1, Math.max(0, value));
const photos = selectAll('.hero-pic');
let photoIndex = 0;
function showPhoto(offset) {
  photoIndex = (photoIndex + offset + photos.length) % photos.length;
  photos.forEach((photo, index) => photo.classList.toggle('active', index === photoIndex));
  select('#slideNo').textContent = String(photoIndex + 1).padStart(2, '0');
}
select('#prev').onclick = () => showPhoto(-1);
select('#next').onclick = () => showPhoto(1);

const entries = [
  ['11 月 04 日 · 晴', '“床铺很暖，窗外就是湖。只是桌上那张合影里，为什么已经有了我？”', '—— 北翼 317 号房，初次入住'],
  ['11 月 04 日 · 雾', '“下楼吃早餐，前台说我已经吃过了。餐厅尽头，有人穿着我的衣服背对着我。”', '—— 北翼 317 号房，第二个早晨'],
  ['11 月 04 日 · 03:17', '“我刚刚才发现，那不是窗户。玻璃另一边的我，已经站起来了。”', '—— 最后一页没有签名']
];
let entryIndex = 0;
let wallChoice = '', foundPhoto = false, peered = false;
function readPage() {
  const [date, text, author] = entries[entryIndex];
  select('#entryDate').textContent = date;
  select('#entryText').textContent = entryIndex === 2 && wallChoice ? (wallChoice === 'knock' ? '“刚听到两下，又一下。我照着敲了回去。墨水还湿着，这一行却不是我写的。”' : '“我没有出声。纸的另一面，有东西在一笔一画地写：我知道你在听。”') : text;
  select('#entryBy').textContent = author;
  select('#entryNo').textContent = `FOLIO 00${entryIndex + 1} / 003`;
  select('#readEntry').textContent = entryIndex === 2 ? '回到第一页 ↶' : '翻阅下一页 →';
}
select('#readEntry').onclick = () => { entryIndex = (entryIndex + 1) % entries.length; readPage(); };
readPage();

const dialog = select('#booking');
const form = select('#bookingForm');
const arrival = select('#arrival');
const departure = select('#departure');
const result = select('#result');
const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function syncDates() {
  if (!arrival.value) return;
  const after = new Date(`${arrival.value}T12:00:00`);
  after.setDate(after.getDate() + 1);
  departure.min = localDate(after);
  if (departure.value < departure.min) departure.value = departure.min;
}
arrival.onchange = syncDates;
selectAll('[data-book]').forEach(button => button.onclick = () => {
  arrival.min = localDate(new Date());
  if (arrival.value < arrival.min) arrival.value = arrival.min;
  syncDates(); form.hidden = false; result.hidden = true; dialog.showModal();
});
select('.close').onclick = () => dialog.close();
dialog.addEventListener('click', event => { if (event.target === dialog && !event.target.closest('form')) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
form.onsubmit = event => {
  event.preventDefault();
  form.hidden = true; result.hidden = false;
  result.innerHTML = '<small>AVAILABLE · SUITE 317</small><h3>北翼 · 林景套房</h3><p class="itinerary"></p><p>只剩下这一间。钥匙已放在前台。</p><button class="primary">查看客房 →</button>';
  result.querySelector('.itinerary').textContent = `${arrival.value} 至 ${departure.value} · ${select('#guests').value}`;
  result.querySelector('button').onclick = () => { dialog.close(); select('#rooms').scrollIntoView(); };
};

let context, master, drone, windFilter, soundOn = false;
const audioButton = select('#audio');
function initAudio() {
  context = new AudioContext(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const data = noise.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < data.length; index++) { previous = previous * .96 + (Math.random() * 2 - 1) * .12; data[index] = previous; }
  const wind = context.createBufferSource(); wind.buffer = noise; wind.loop = true;
  windFilter = context.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 1600;
  wind.connect(windFilter).connect(master); wind.start();
  drone = context.createOscillator(); drone.frequency.value = 106;
  const tone = context.createGain(); tone.gain.value = .09; drone.connect(tone).connect(master); drone.start();
}
function stopSound() {
  soundOn = false; if (master) master.gain.setTargetAtTime(0, context.currentTime, .12);
  audioButton.setAttribute('aria-pressed','false'); audioButton.setAttribute('aria-label','开启环境音'); audioButton.querySelector('small').textContent = 'OFF';
}
audioButton.onclick = async () => {
  if (soundOn) { stopSound(); return; }
  try { if (!context) initAudio(); await context.resume(); soundOn = true; master.gain.setTargetAtTime(.28, context.currentTime, .45); audioButton.setAttribute('aria-pressed','true'); audioButton.setAttribute('aria-label','关闭环境音'); audioButton.querySelector('small').textContent='ON'; renderScroll(); }
  catch { audioButton.querySelector('small').textContent='不可用'; }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSound(); });

const end = select('#end');
const room = select('#rooms');
const scenes = [
  ['SIGNAL FOUND · ROOM 317','请不要回头。','走廊里的人，一直面向你的房门。'],
  ['MOTION DETECTED · 03:17','它已经到了门外。','你没有听见脚步。门把手却在慢慢转动。'],
  ['CAMERA SOURCE · INSIDE YOUR ROOM','欢迎回来。','监控里，房门从未打开。那你身后的是谁？']
];
let lastScene = -1, pending = false;
function renderScroll() {
  pending = false;
  const distance = end.getBoundingClientRect().top;
  const approach = clamp(-distance / Math.max(1,end.offsetHeight - innerHeight));
  const dread = clamp((innerHeight*.7 - room.getBoundingClientRect().top) / (innerHeight*1.5));
  room.style.setProperty('--dread', dread.toFixed(3)); end.style.setProperty('--approach', approach.toFixed(4));
  const sceneIndex = approach > .76 ? 2 : approach > .34 ? 1 : 0;
  end.style.setProperty('--seen',clamp((approach - .74) * 5.8).toFixed(3));
  select('.monitor').classList.toggle('seen', sceneIndex === 2);
  if (sceneIndex !== lastScene) {
    lastScene = sceneIndex;
    [select('#feedState'),select('#endTitle'),select('#endCopy')].forEach((node,index) => node.textContent = scenes[sceneIndex][index]);
    if (sceneIndex === 2 && (wallChoice || peered)) select('#endCopy').textContent = peered ? '你已经合上了猫眼。它却还看得见你。' : wallChoice === 'knock' ? '它用你敲过的节奏，敲了三下镜头。' : '你没有回答。录音里，却一直有你的声音。';
  }
  if (soundOn) { drone.frequency.setTargetAtTime(106 - dread*34 - approach*29,context.currentTime,.35); windFilter.frequency.setTargetAtTime(1600 - dread*950,context.currentTime,.4); }
}
function queueScroll() { if (!pending) { pending = true; requestAnimationFrame(renderScroll); } }
window.addEventListener('scroll',queueScroll,{passive:true}); window.addEventListener('resize',queueScroll); renderScroll();
const guide = select('#guide');
select('#guideOpen').onclick = () => guide.showModal();
selectAll('#guide a').forEach(link => link.onclick = () => guide.close());
selectAll('.dismiss').forEach(button => button.onclick = () => button.closest('dialog').close());
function flipPhoto(turned) {
  select('#verso').hidden = !turned;
  select('.postcard').classList.toggle('turned', turned);
  select('.postcard').classList.toggle('marked', foundPhoto);
  select('#flip').textContent = turned ? '翻回正面 ↻' : '翻看背面 ↻';
  select('#flip').setAttribute('aria-expanded', String(turned));
}
select('#flip').onclick = () => { foundPhoto = true; flipPhoto(select('#verso').hidden); };

const wallText = select('#wallText');
const initialWallText = wallText.textContent;
let replyTimer, lensTimer;
function knockSound(delays) {
  if (!soundOn || !context || document.hidden) return;
  delays.forEach(delay => {
    const onset = context.currentTime + delay;
    const tap = context.createOscillator(), envelope = context.createGain();
    tap.type='sine'; tap.frequency.setValueAtTime(158,onset); tap.frequency.exponentialRampToValueAtTime(46,onset+.14);
    envelope.gain.setValueAtTime(0,onset); envelope.gain.linearRampToValueAtTime(.43,onset+.009); envelope.gain.exponentialRampToValueAtTime(.001,onset+.21);
    tap.connect(envelope).connect(master); tap.start(onset); tap.stop(onset+.22); tap.onended = () => { tap.disconnect(); envelope.disconnect(); };
  });
}
function chooseWall(choice) {
  clearTimeout(replyTimer); wallChoice = choice; lastScene = -1; peered = false;
  select('.console').classList.add('answered');
  select('#quiet').setAttribute('aria-pressed',String(choice === 'quiet'));
  select('#knock').setAttribute('aria-pressed',String(choice === 'knock'));
  const answered = choice === 'knock';
  wallText.textContent = answered ? '你敲了两下，停了一会，又敲了一下。' : '你屏住呼吸。敲墙的东西也安静下来。';
  select('#lineState').textContent = answered ? 'TX ·· — ·' : 'LINE MUTED';
  if (answered) knockSound([0,.21,.78]);
  replyTimer = setTimeout(() => {
    wallText.textContent = answered ? '同样的三下。这次，声音来自你枕头里面。' : '接线灯亮了。听筒里有人轻声说：“别憋着了。”';
    select('#lineState').textContent = answered ? 'RX ·· — ·  /  INSIDE' : 'LINE 02  /  OCCUPIED';
    if (answered && select('.console').getBoundingClientRect().bottom > 0) knockSound([0,.21,.78]);
  },1500);
  readPage(); renderScroll();
}
select('#knock').onclick = () => chooseWall('knock');
select('#quiet').onclick = () => chooseWall('quiet');

const lens = select('#peephole');
let lensStep = 0;
function showLens(step) {
  clearTimeout(lensTimer); lensStep = step;
  lens.classList.toggle('open-eye',step === 2);
  const lensScenes = [
    ['OPTICS 01 · CLEAR','走廊是空的。',foundPhoto ? '地上放着那张旧照。背面的墨迹还没干。' : '走廊深处，值夜室的灯还亮着。','再靠近一点'],
    ['OPTICS 02 · NO SIGNAL','门外没有脚步声。',wallChoice === 'knock' ? '两下，停顿，一下。玻璃从另一侧轻轻震动。' : wallChoice === 'quiet' ? '一层薄雾蒙住玻璃。门外也有人屏着呼吸。' : '猫眼中央出现一小块黑影，遮住了走廊的灯。','擦去雾气'],
    ['REVERSE FEED · ROOM OCCUPIED','它也在往里看。',wallChoice === 'knock' ? '这次，三下敲击声从你的门内传来。' : '那不是走廊的灯。是你房间在它瞳孔里的倒影。','合上猫眼']
  ];
  [select('#lensCode'),select('#lensTitle'),select('#lensText'),select('#lensAction')].forEach((node,index) => node.textContent = lensScenes[step][index]);
  lens.classList.toggle('fogged',step === 1);
  if (step === 1) { knockSound([.25,.46,1.03]); lensTimer=setTimeout(() => { if (lens.open && !document.hidden) showLens(2); },3600); }
  if (step === 2) { peered = true; lastScene = -1; knockSound([.12]); renderScroll(); }
}
select('#look').onclick = () => { showLens(0); lens.showModal(); };
select('#lensAction').onclick = () => lensStep === 2 ? lens.close() : showLens(lensStep + 1);
lens.addEventListener('close',() => { clearTimeout(lensTimer); lens.style.removeProperty('--gaze'); });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
lens.addEventListener('pointermove',event => { if (!reducedMotion.matches) lens.style.setProperty('--gaze', `${(event.clientX / innerWidth - .5) * 16}px`); });
select('#escape').onclick = () => {
  clearTimeout(replyTimer); stopSound(); showPhoto(-photoIndex); entryIndex=0; wallChoice=''; foundPhoto=false; peered=false; lastScene=-1;
  select('.console').classList.remove('answered'); wallText.textContent=initialWallText; select('#lineState').textContent='LINE 01 · LISTENING';
  selectAll('.wall-choices button').forEach(button => button.setAttribute('aria-pressed','false'));
  flipPhoto(false); readPage(); window.scrollTo({top:0,behavior:'instant'}); select('.brand').focus({preventScroll:true}); renderScroll();
};
