'use strict';
const select = selector => document.querySelector(selector);
const selectAll = selector => [...document.querySelectorAll(selector)];
const clamp = value => Math.min(1, Math.max(0, value));
const between = (low, high) => low + Math.random() * (high - low);
const wait = duration => new Promise(resolve => setTimeout(resolve, duration));
const pad = value => String(value).padStart(2, '0');
const root = document.documentElement;
const fxLayer = select('.fx');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const dialogOpen = () => Boolean(select('dialog[open]'));
// entered: past the gate · busy: a scare is on screen · scared: the last frame has played · returned: left, and came back
const night = { entered: false, busy: false, scared: false, returned: false, zone: 'lit', fear: 0 };
new Image().src = 'assets/face.jpg';

/* ───────── Sound: everything is synthesised, nothing is downloaded ───────── */
const MASTER_LEVEL = .5, BED_LEVEL = .56;
let context, master, bed, drone, windFilter, subGain, stringGain, rumbleBuffer, hissBuffer, soundOn = false;
const audioButton = select('#audio');
const audible = () => soundOn && context && !document.hidden;

function initAudio() {
  context = new AudioContext();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -9; limiter.knee.value = 3; limiter.ratio.value = 18; limiter.attack.value = .002; limiter.release.value = .2;
  master = context.createGain(); master.gain.value = 0; master.connect(limiter).connect(context.destination);
  bed = context.createGain(); bed.gain.value = BED_LEVEL; bed.connect(master);

  rumbleBuffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const rumble = rumbleBuffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < rumble.length; index++) { previous = previous * .96 + (Math.random() * 2 - 1) * .12; rumble[index] = previous; }
  hissBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const hiss = hissBuffer.getChannelData(0);
  for (let index = 0; index < hiss.length; index++) hiss[index] = Math.random() * 2 - 1;

  const wind = context.createBufferSource(); wind.buffer = rumbleBuffer; wind.loop = true;
  windFilter = context.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 1600;
  wind.connect(windFilter).connect(bed); wind.start();
  drone = context.createOscillator(); drone.frequency.value = 106;
  const droneLevel = context.createGain(); droneLevel.gain.value = .09; drone.connect(droneLevel).connect(bed); drone.start();
  const sub = context.createOscillator(); sub.frequency.value = 41;
  subGain = context.createGain(); subGain.gain.value = 0; sub.connect(subGain).connect(bed); sub.start();

  // A string section that never resolves; it only becomes audible as the page gets darker.
  stringGain = context.createGain(); stringGain.gain.value = 0;
  const stringColour = context.createBiquadFilter(); stringColour.type = 'bandpass'; stringColour.frequency.value = 1250; stringColour.Q.value = .7;
  stringColour.connect(stringGain).connect(bed);
  [587.3, 622.3, 659.3, 740, 784].forEach((frequency, index) => {
    const voice = context.createOscillator(), level = context.createGain();
    voice.type = 'sawtooth'; voice.frequency.value = frequency; voice.detune.value = (index - 2) * 7; level.gain.value = .2;
    voice.connect(level).connect(stringColour); voice.start();
  });
  const swell = context.createOscillator(), swellDepth = context.createGain();
  swell.frequency.value = .11; swellDepth.gain.value = .05; swell.connect(swellDepth).connect(stringGain.gain); swell.start();
}

function burst({ at = 0, length = .2, level = .2, type = 'highpass', from = 1800, to = from, q = .8, attack = .005, pan = 0, buffer = hissBuffer, out = master } = {}) {
  if (!audible()) return;
  const onset = context.currentTime + at;
  const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain(), panner = context.createStereoPanner();
  source.buffer = buffer; source.loop = true; filter.type = type; filter.Q.value = q; panner.pan.value = pan;
  filter.frequency.setValueAtTime(from, onset);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, onset + length);
  envelope.gain.setValueAtTime(0, onset); envelope.gain.linearRampToValueAtTime(level, onset + attack); envelope.gain.exponentialRampToValueAtTime(.0008, onset + length);
  source.connect(filter).connect(envelope).connect(panner).connect(out);
  source.start(onset, Math.random() * 1.5); source.stop(onset + length + .03);
  source.onended = () => panner.disconnect();
}
function tone({ at = 0, length = .3, level = .3, type = 'sine', from = 120, to = from, glide = length, attack = .008, out = master } = {}) {
  if (!audible()) return;
  const onset = context.currentTime + at;
  const voice = context.createOscillator(), envelope = context.createGain();
  voice.type = type; voice.frequency.setValueAtTime(from, onset);
  if (to !== from) voice.frequency.exponentialRampToValueAtTime(to, onset + glide);
  envelope.gain.setValueAtTime(0, onset); envelope.gain.linearRampToValueAtTime(level, onset + attack); envelope.gain.exponentialRampToValueAtTime(.0008, onset + length);
  voice.connect(envelope).connect(out); voice.start(onset); voice.stop(onset + length + .03);
  voice.onended = () => envelope.disconnect();
}
const knockSound = delays => delays.forEach(delay => tone({ at: delay, from: 158, to: 46, glide: .14, length: .21, level: .3, attack: .009 }));
const staticBurst = (length = .16, level = .14) => burst({ length, level, from: 2200 });
const thud = (level = .5) => { tone({ from: 74, to: 30, glide: .3, length: .55, level }); burst({ type: 'lowpass', from: 320, length: .3, level: level * .6, buffer: rumbleBuffer }); };
const torchClick = () => { burst({ type: 'bandpass', from: 3400, q: 4, length: .03, level: .22 }); burst({ at: .05, type: 'bandpass', from: 2500, q: 4, length: .03, level: .12 }); };
const pageSound = () => burst({ type: 'bandpass', from: 2600, to: 1500, q: .9, length: .17, level: .07, attack: .03 });
const powerDown = () => { tone({ type: 'sawtooth', from: 118, to: 21, length: .85, level: .15 }); burst({ from: 3200, length: .04, level: .2 }); };
function buzz() { [0, .33, .55].forEach(at => { tone({ at, type: 'square', from: 50, length: .1, level: .045 }); burst({ at, from: 5200, length: .05, level: .05 }); }); }
function whisper(pan = 0) {
  const syllables = 4 + Math.floor(Math.random() * 3);
  for (let index = 0; index < syllables; index++) burst({ at: index * .17 + Math.random() * .05, length: between(.13, .21), level: between(.08, .15), type: 'bandpass', from: between(1500, 2800), to: between(1200, 2200), q: 2.2, attack: .03, pan });
}
function creak() {
  if (!audible()) return;
  const onset = context.currentTime + .05, length = 1.9;
  const hinge = context.createOscillator(), body = context.createBiquadFilter(), edge = context.createBiquadFilter(), envelope = context.createGain();
  hinge.type = 'sawtooth'; hinge.frequency.setValueCurveAtTime(new Float32Array([62, 71, 66, 84, 79, 97, 91, 118, 109, 131]), onset, length);
  body.type = 'bandpass'; body.frequency.value = 760; body.Q.value = 7; edge.type = 'bandpass'; edge.frequency.value = 2300; edge.Q.value = 9;
  envelope.gain.setValueCurveAtTime(new Float32Array([0, .24, .1, .32, .16, .36, .2, .3, 0]), onset, length);
  hinge.connect(body).connect(envelope); hinge.connect(edge).connect(envelope); envelope.connect(master);
  hinge.start(onset); hinge.stop(onset + length + .05);
  tone({ at: 2.05, from: 92, to: 33, glide: .3, length: .7, level: .5 });
}
// The scare: a slam of falling noise, a sub impact, and a cluster of voices bending sharp.
function sting(level = 1) {
  if (!audible()) return;
  const onset = context.currentTime + .005, out = context.createGain();
  out.gain.value = level; out.connect(master);
  burst({ length: 1.5, level: .85, type: 'lowpass', from: 9000, to: 420, attack: .004, out });
  tone({ from: 96, to: 27, glide: .5, length: 1.1, level: .9, attack: .004, out });
  const shriek = context.createGain(), rough = context.createGain(), colour = context.createBiquadFilter(), tremolo = context.createOscillator(), depth = context.createGain();
  shriek.gain.setValueAtTime(0, onset); shriek.gain.linearRampToValueAtTime(.55, onset + .008); shriek.gain.setValueAtTime(.55, onset + .4); shriek.gain.exponentialRampToValueAtTime(.0008, onset + 1.6);
  rough.gain.value = .6; tremolo.type = 'square'; tremolo.frequency.value = 31; depth.gain.value = .4; tremolo.connect(depth).connect(rough.gain);
  colour.type = 'bandpass'; colour.frequency.value = 1900; colour.Q.value = .5;
  [466, 494, 554, 622, 698, 740, 932, 1109].forEach(frequency => {
    const voice = context.createOscillator(), voiceLevel = context.createGain();
    voice.type = 'sawtooth'; voiceLevel.gain.value = .14;
    voice.frequency.setValueAtTime(frequency * between(.99, 1.01), onset); voice.frequency.exponentialRampToValueAtTime(frequency * 1.12, onset + 1.2);
    voice.connect(voiceLevel).connect(colour); voice.start(onset); voice.stop(onset + 1.7);
  });
  colour.connect(rough).connect(shriek).connect(out); tremolo.start(onset); tremolo.stop(onset + 1.7);
  setTimeout(() => out.disconnect(), 2200);
}
const duck = (level = 0, glide = .08) => { if (context) bed.gain.setTargetAtTime(level, context.currentTime, glide); };
const unduck = () => duck(BED_LEVEL, .7);

let heartTimer;
function heartbeat() {
  clearTimeout(heartTimer);
  const urgency = night.scared ? 1 : clamp((night.fear - .5) / .5);
  if (night.fear > .5 && !night.busy) {
    tone({ from: 58, to: 34, glide: .12, length: .22, level: .2 + urgency * .22 });
    tone({ at: .2, from: 52, to: 32, glide: .12, length: .2, level: .14 + urgency * .18 });
  }
  if (soundOn) heartTimer = setTimeout(heartbeat, 1200 - urgency * 600);
}
async function setSound(on) {
  if (on) {
    try { if (!context) initAudio(); await context.resume(); soundOn = true; master.gain.setTargetAtTime(MASTER_LEVEL, context.currentTime, .45); }
    catch { soundOn = false; audioButton.querySelector('small').textContent = '不可用'; return; }
  } else { soundOn = false; if (master) master.gain.setTargetAtTime(0, context.currentTime, .12); }
  audioButton.setAttribute('aria-pressed', String(soundOn));
  audioButton.setAttribute('aria-label', soundOn ? '关闭环境音' : '开启环境音');
  audioButton.querySelector('small').textContent = soundOn ? 'ON' : 'OFF';
  if (soundOn) { renderScroll(); heartbeat(); }
}
audioButton.onclick = () => setSound(!soundOn);

/* ───────── Small shared effects ───────── */
const murmurNode = select('#murmur');
let murmurTimer;
function murmur(text, hold = 3800) {
  clearTimeout(murmurTimer);
  murmurNode.textContent = text; murmurNode.classList.add('on');
  murmurTimer = setTimeout(() => murmurNode.classList.remove('on'), hold);
}
function replay(node, name) { node.classList.remove(name); void node.offsetWidth; node.classList.add(name); }
function tear(strength = 1) {
  if (reducedMotion.matches) return;
  fxLayer.style.setProperty('--ty', `${between(8, 82).toFixed(1)}vh`);
  replay(root, 'tear'); staticBurst(.16, .13 * strength);
  setTimeout(() => root.classList.remove('tear'), 300);
}
function typeInto(node, text, speed = 30) {
  clearInterval(node.typing);
  if (reducedMotion.matches) { node.textContent = text; return; }
  let shown = 0; node.textContent = '';
  node.typing = setInterval(() => { node.textContent = text.slice(0, ++shown); if (shown >= text.length) clearInterval(node.typing); }, speed);
}
function scrambleTo(node, text, duration = 1100) {
  if (reducedMotion.matches) { node.textContent = text; return; }
  const original = node.textContent, glyphs = '▚▞░▒╱╲│─', length = Math.max(original.length, text.length), start = performance.now();
  (function frame(now) {
    const progress = clamp((now - start) / duration);
    let output = '';
    for (let index = 0; index < length; index++) {
      const settle = index / length * .6 + .2;
      output += progress >= settle + .18 ? (text[index] || '') : progress >= settle ? glyphs[Math.floor(Math.random() * glyphs.length)] : (original[index] || '');
    }
    node.textContent = progress < 1 ? output : text;
    if (progress < 1) requestAnimationFrame(frame);
  })(start);
}
// Runs once, after the element has stayed in view for `dwell` ms.
function onDwell(element, ratio, dwell, callback) {
  let timer;
  const observer = new IntersectionObserver(([entry]) => {
    clearTimeout(timer);
    if (entry.intersectionRatio >= ratio) timer = setTimeout(() => { observer.disconnect(); callback(); }, dwell);
  }, { threshold: [ratio] });
  observer.observe(element);
}
const shoutNode = select('#shout');
function shout(text, level = .7) {
  night.busy = true;
  const word = document.createElement('span'); word.textContent = text;
  shoutNode.replaceChildren(word); shoutNode.classList.add('on');
  sting(level);
  setTimeout(() => { shoutNode.classList.remove('on'); night.busy = false; }, reducedMotion.matches ? 1500 : 950);
}

/* ───────── Hero: the album has one photograph too many ───────── */
const photos = selectAll('.hero-pic');
const seenPhotos = new Set([0]);
const slideNo = select('#slideNo');
let photoIndex = 0;
function showPhoto(offset) {
  const count = seenPhotos.size >= 3 ? photos.length : photos.length - 1;
  photoIndex = (photoIndex + offset + count) % count;
  if (photoIndex < 3) seenPhotos.add(photoIndex);
  photos.forEach((photo, index) => photo.classList.toggle('active', index === photoIndex));
  slideNo.textContent = pad(photoIndex + 1);
  slideNo.classList.toggle('wrong', photoIndex === 3);
  if (photoIndex === 3 && offset) { tear(.7); murmur('相册里只有三张照片。'); }
}
select('#prev').onclick = () => showPhoto(-1);
select('#next').onclick = () => showPhoto(1);

const heroDoor = select('#heroDoor');
const doorText = () => night.returned ? '你开了门。' : '不要开门。';
function glitchTitle() {
  setTimeout(glitchTitle, between(8000, 15000));
  if (!night.entered || night.busy || document.hidden || reducedMotion.matches || dialogOpen() || window.scrollY > innerHeight * .5) return;
  heroDoor.textContent = night.returned ? '还没关上。' : '让我进去。'; heroDoor.classList.add('glitch'); staticBurst(.09, .05);
  setTimeout(() => { heroDoor.textContent = doorText(); heroDoor.classList.remove('glitch'); }, 130);
}

/* ───────── Guest register ───────── */
const entries = [
  ['11 月 04 日 · 晴', '“床铺很暖，窗外就是湖。只是桌上那张合影里，为什么已经有了我？”', '—— 北翼 317 号房，初次入住'],
  ['11 月 04 日 · 雾', '“下楼吃早餐，前台说我已经吃过了。餐厅尽头，有人穿着我的衣服背对着我。”', '—— 北翼 317 号房，第二个早晨'],
  ['11 月 04 日 · 03:17', '“我刚刚才发现，那不是窗户。玻璃另一边的我，已经站起来了。”', '—— 最后一页没有签名']
];
// The page after the last page is dated by the reader's own clock.
function liveEntry() {
  const now = new Date();
  return [`${now.getMonth() + 1} 月 ${pad(now.getDate())} 日 · ${pad(now.getHours())}:${pad(now.getMinutes())}`, '“屏幕很暗，你应该已经能看见自己的倒影了。数一数，倒影里有几个人。”', '—— 这一页，是刚刚才写上去的'];
}
const scrawlTexts = { 1: '它在看你翻', 3: '别数', 4: '第三个人是谁' };
const register = select('.register');
const entryText = select('#entryText');
let entryIndex = 0, pageTurns = 0;
let wallChoice = '', foundPhoto = false, peered = false;
function readPage(animate = false) {
  const last = entryIndex === 2, extra = entryIndex === 3;
  const [date, text, author] = extra ? liveEntry() : entries[entryIndex];
  register.toggleAttribute('data-last', last); register.toggleAttribute('data-now', extra);
  select('#entryDate').textContent = date;
  const body = last && wallChoice ? (wallChoice === 'knock' ? '“刚听到两下，又一下。我照着敲了回去。墨水还湿着，这一行却不是我写的。”' : '“我没有出声。纸的另一面，有东西在一笔一画地写：我知道你在听。”') : text;
  if (animate) typeInto(entryText, body, 20); else { clearInterval(entryText.typing); entryText.textContent = body; }
  select('#entryBy').textContent = author;
  select('#entryNo').textContent = `FOLIO 00${entryIndex + 1} / 003`;
  select('#readEntry').textContent = extra ? '合上登记簿 ↶' : last ? '还有一页 →' : '翻阅下一页 →';
}
select('#readEntry').onclick = () => {
  entryIndex = (entryIndex + 1) % 4; pageTurns++;
  pageSound(); readPage(true);
  if (scrawlTexts[pageTurns]) { const scrawl = document.createElement('span'); scrawl.textContent = scrawlTexts[pageTurns]; select('.scrawls').append(scrawl); }
  if (entryIndex === 3) setTimeout(() => { if (entryIndex === 3 && !night.busy) { whisper(-.6); murmur('不要数第三次。'); } }, 3200);
};
readPage();

/* ───────── Booking ───────── */
const dialog = select('#booking');
const form = select('#bookingForm');
const arrival = select('#arrival');
const departure = select('#departure');
const result = select('#result');
const localDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  result.innerHTML = '<small>AVAILABLE · SUITE 317</small><h3>北翼 · 林景套房</h3><p class="itinerary"></p><p>只剩下这一间。钥匙已放在前台。<br>登记簿上多出的那一位，我们没能划掉。</p><button class="primary">查看客房 →</button>';
  // The register always counts one more guest than you brought.
  const guests = select('#guests').value, struck = document.createElement('s');
  struck.textContent = guests;
  result.querySelector('.itinerary').append(`${arrival.value} 至 ${departure.value} · `, struck, ` ${parseInt(guests, 10) + 1} 位住客`);
  result.querySelector('button').onclick = () => { dialog.close(); select('#rooms').scrollIntoView(); };
};

/* ───────── CAM 03 and the scroll-driven dread ───────── */
const end = select('#end');
const room = select('#rooms');
const journal = select('#journal');
const scenes = [
  ['SIGNAL FOUND · ROOM 317', '请不要回头。', '走廊里的人，一直面向你的房门。'],
  ['MOTION DETECTED · 03:17', '它已经到了门外。', '你没有听见脚步。门把手却在慢慢转动。'],
  ['CAMERA SOURCE · INSIDE YOUR ROOM', '欢迎回来。', '监控里，房门从未打开。那你身后的是谁？']
];
const aftermath = ['CAM 03 · NO SUBJECT', '别回头。', '镜头已经拍不到它了。它在屏幕的这一侧。'];
let lastScene = -1, pending = false;
const monitor = select('.monitor');
const tapeMessage = select('#tapeMessage');
const cueButtons = selectAll('[data-cue]');
const captions = ['刚才，这里是空的。', '我在门外。', '你身后。'];
let shownCue = -1, captionTimer;

function showTapeCaption(index) {
  clearTimeout(captionTimer);
  shownCue = index;
  tapeMessage.textContent = captions[index];
  if (!reducedMotion.matches) {
    tapeMessage.animate([{ opacity: 0, translate: '-5px 0' }, { opacity: 1, translate: '0' }], { duration: 170 });
  }
  captionTimer = setTimeout(() => { tapeMessage.textContent = ''; }, 2700);
}
cueButtons.forEach((button, index) => button.onclick = () => {
  const start = window.scrollY + end.getBoundingClientRect().top;
  const travel = end.offsetHeight - monitor.offsetHeight;
  window.scrollTo({ top: start + [0, .56, 1][index] * travel, behavior: 'instant' });
  renderScroll();
});
function renderScroll() {
  pending = false;
  const distance = end.getBoundingClientRect().top;
  const approach = clamp(-distance / Math.max(1, end.offsetHeight - monitor.offsetHeight));
  const dread = clamp((innerHeight * .7 - room.getBoundingClientRect().top) / (innerHeight * 1.5));
  night.fear = clamp(window.scrollY / Math.max(1, root.scrollHeight - innerHeight));
  fxLayer.style.setProperty('--fear', night.fear.toFixed(3));
  room.style.setProperty('--dread', dread.toFixed(3)); end.style.setProperty('--approach', approach.toFixed(4));
  const sceneIndex = approach > .76 ? 2 : approach > .34 ? 1 : 0;
  if (distance < monitor.offsetHeight * .2 && shownCue !== sceneIndex && !document.hidden && !night.scared) showTapeCaption(sceneIndex);
  select('#tapeTime').textContent = `03:17:${pad(Math.round(approach * 27))}`;
  end.style.setProperty('--seen', clamp((approach - .74) * 5.8).toFixed(3));
  monitor.classList.toggle('seen', sceneIndex === 2);
  if (sceneIndex !== lastScene) {
    // A real cut between frames tears the tape; a forced re-render (lastScene === -1) does not.
    if (lastScene !== -1 && night.entered && !reducedMotion.matches && distance < innerHeight) {
      replay(monitor, 'tear'); staticBurst(.2, .16);
      setTimeout(() => monitor.classList.remove('tear'), 320);
    }
    lastScene = sceneIndex;
    monitor.dataset.frame = String(sceneIndex);
    cueButtons.forEach((button, index) => {
      if (index === sceneIndex) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    const copy = sceneIndex === 2 && night.scared ? aftermath : scenes[sceneIndex];
    [select('#feedState'), select('#endTitle'), select('#endCopy')].forEach((node, index) => node.textContent = copy[index]);
    if (sceneIndex === 2 && !night.scared && (wallChoice || peered)) select('#endCopy').textContent = peered ? '你已经合上了猫眼。它却还看得见你。' : wallChoice === 'knock' ? '它用你敲过的节奏，敲了三下镜头。' : '你没有回答。录音里，却一直有你的声音。';
  }
  if (night.entered) {
    setZone(distance < innerHeight * .3 ? 'monitor' : journal.getBoundingClientRect().top < innerHeight * .66 ? 'dark' : 'lit');
    watchLinger(approach);
  }
  if (soundOn) {
    const now = context.currentTime;
    drone.frequency.setTargetAtTime(106 - dread * 34 - approach * 29, now, .35);
    windFilter.frequency.setTargetAtTime(1600 - dread * 950, now, .4);
    subGain.gain.setTargetAtTime(night.fear * .4, now, .5);
    stringGain.gain.setTargetAtTime(.06 + clamp((night.fear - .4) / .5) * .3, now, .6);
  }
}
function queueScroll() { if (!pending) { pending = true; requestAnimationFrame(renderScroll); } }
window.addEventListener('scroll', queueScroll, { passive: true }); window.addEventListener('resize', queueScroll);

/* ───────── The power cut: a torch, and something the torch finds ───────── */
const beamRadius = () => Math.min(Math.min(innerWidth, innerHeight) * .46, 360);
const watcher = select('.fx-watcher');
const figure = select('.fx-figure');
const watcherStages = [{ gap: 15, size: 3 }, { gap: 26, size: 4 }, { gap: 56, size: 6 }];
let lightX = innerWidth / 2, lightY = innerHeight * .45, lightQueued = false;
let watcherTimer, watcherOn = false, watcherX = 0, watcherY = 0, sightings = 0, cutBefore = false, begged = false;

function moveLight(x, y) {
  lightX = x; lightY = y;
  if (lightQueued) return;
  lightQueued = true;
  requestAnimationFrame(() => {
    lightQueued = false;
    fxLayer.style.setProperty('--lx', `${lightX}px`); fxLayer.style.setProperty('--ly', `${lightY}px`);
    checkWatcher();
  });
}
window.addEventListener('pointermove', event => moveLight(event.clientX, event.clientY), { passive: true });
window.addEventListener('pointerdown', event => moveLight(event.clientX, event.clientY), { passive: true });
// Keyboard readers get the torch pointed at whatever they focus.
document.addEventListener('focusin', event => {
  if (night.zone !== 'dark' || !event.target.matches?.(':focus-visible')) return;
  const bounds = event.target.getBoundingClientRect();
  moveLight(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
});

function setZone(zone) {
  if (zone === night.zone) return;
  const previous = night.zone;
  night.zone = zone;
  if (zone === 'dark') {
    if (previous === 'lit') cutPower();
    else { root.classList.add('blackout'); scheduleWatcher(); if (!begged) { begged = true; murmur('别走。'); } }
    return;
  }
  clearTimeout(watcherTimer); watcherOn = false; watcher.classList.remove('on');
  root.classList.remove('blackout');
  if (zone === 'lit' && previous === 'dark' && !reducedMotion.matches) { replay(root, 'restoring'); buzz(); setTimeout(() => root.classList.remove('restoring'), 720); }
}
function cutPower() {
  powerDown();
  if (reducedMotion.matches) root.classList.add('blackout');
  else {
    replay(root, 'cutting');
    setTimeout(() => { if (night.zone === 'dark') root.classList.add('blackout'); }, 540);
    setTimeout(() => { root.classList.remove('cutting'); if (night.zone === 'dark') torchClick(); }, 1500);
  }
  if (!cutBefore) { cutBefore = true; setTimeout(() => { if (night.zone === 'dark') murmur('北翼供电中断 · 请用手电照明', 4200); }, 1800); }
  scheduleWatcher(between(5000, 7500));
}
function scheduleWatcher(delay = between(3500, 6500)) {
  clearTimeout(watcherTimer);
  if (sightings < watcherStages.length) watcherTimer = setTimeout(showWatcher, delay);
}
function showWatcher() {
  if (night.zone !== 'dark') return;
  if (night.busy || document.hidden || dialogOpen()) { scheduleWatcher(2000); return; }
  // Somewhere the torch is not pointing.
  let best = 0;
  for (let attempt = 0; attempt < 14; attempt++) {
    const x = between(.08, .92) * innerWidth, y = between(.16, .8) * innerHeight, reach = Math.hypot(x - lightX, y - lightY);
    if (reach > best) { best = reach; watcherX = x; watcherY = y; }
  }
  if (best < beamRadius() * 1.15) { scheduleWatcher(2500); return; }
  const stage = watcherStages[sightings];
  fxLayer.style.setProperty('--wx', `${watcherX}px`); fxLayer.style.setProperty('--wy', `${watcherY}px`);
  fxLayer.style.setProperty('--gap', `${stage.gap}px`); fxLayer.style.setProperty('--ws', `${stage.size}px`);
  watcher.classList.remove('shut'); watcher.classList.add('on'); watcherOn = true;
}
function checkWatcher() {
  if (!watcherOn || night.busy || Math.hypot(lightX - watcherX, lightY - watcherY) > beamRadius() * .6) return;
  watcherOn = false; sightings++;
  if (sightings < watcherStages.length) {
    // The first two times it closes its eyes and is somewhere else, nearer.
    watcher.classList.add('shut'); setTimeout(() => watcher.classList.remove('on'), 110);
    whisper(clamp(watcherX / innerWidth) * 2 - 1);
    scheduleWatcher(between(3200, 6000));
    return;
  }
  // The third time it does not look away.
  night.busy = true;
  const calm = reducedMotion.matches;
  watcher.classList.remove('on');
  fxLayer.style.setProperty('--fh', `${watcherStages[2].gap / .166}px`);
  figure.classList.add('on'); thud(.75); staticBurst(.3, .2);
  setTimeout(() => { figure.classList.remove('on'); if (!calm) root.classList.add('dropout'); }, calm ? 1100 : 420);
  setTimeout(() => { root.classList.remove('dropout'); torchClick(); night.busy = false; murmur('它不躲了。', 3200); }, calm ? 1150 : 660);
}

/* ───────── The last frame ───────── */
const face = select('#face');
let lingerTimer = 0;
const canScare = () => night.entered && !night.scared && !night.busy && !document.hidden && !dialogOpen();
// Staying at the very end of the tape for a few seconds is what sets it off.
function watchLinger(approach) {
  if (night.scared) return;
  if (approach < .985) { clearTimeout(lingerTimer); lingerTimer = 0; return; }
  if (!lingerTimer) lingerTimer = setTimeout(() => { lingerTimer = 0; if (canScare()) finale(false); }, 2400);
}
async function finale(leaving) {
  night.scared = true; night.busy = true;
  const calm = reducedMotion.matches;
  clearTimeout(captionTimer); tapeMessage.textContent = '';
  monitor.classList.add('lost'); select('#feedState').textContent = 'SIGNAL LOST';
  staticBurst(.7, .28); duck();
  await wait(750);
  face.classList.add('hold');   // black, and nothing to hear
  await wait(1500);
  face.classList.add('show'); sting(1);
  await wait(calm ? 1700 : 1250);
  face.classList.remove('show'); face.classList.add('after');
  await wait(2600);
  monitor.classList.remove('lost'); monitor.classList.add('aftermath');
  if (leaving) leave(); else { lastScene = -1; renderScroll(); }
  face.classList.add('fading');
  await wait(900);
  face.className = 'fx-face';
  unduck(); night.busy = false; heartbeat();
}

/* ───────── Field guide, postcard ───────── */
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

/* ───────── Room 317: the lights ───────── */
const roomImage = select('.room-image');
let roomStage = 0, roomBusy = false, roomTimer;
function roomFlicker() {
  if (roomBusy || roomStage >= 2 || night.busy || document.hidden) return;
  roomBusy = true; roomStage++;
  roomImage.dataset.ghost = String(roomStage);
  if (reducedMotion.matches) roomImage.classList.add('still');
  else { replay(roomImage, 'flicker'); buzz(); setTimeout(() => thud(.35), 230); }
  setTimeout(() => {
    roomImage.classList.remove('flicker', 'still'); roomBusy = false;
    if (roomStage === 1) typeInto(select('#roomNote2'), '又及：衣柜里那件浴袍不是山庄的。请不要替它系好腰带。', 46);
  }, reducedMotion.matches ? 2200 : 1500);
}
function watchRoom() {
  new IntersectionObserver(([entry]) => {
    clearTimeout(roomTimer);
    if (entry.intersectionRatio < .6 || roomStage >= 2) return;
    // Once when you first look; once more, nearer, if you keep looking or come back.
    roomTimer = setTimeout(function look() { roomFlicker(); if (roomStage < 2) roomTimer = setTimeout(look, 9000); }, roomStage ? 900 : 1400);
  }, { threshold: [.6] }).observe(roomImage);
}

/* ───────── The wall ───────── */
const consoleBox = select('.console');
const wallText = select('#wallText');
const lineState = select('#lineState');
const initialWallText = wallText.textContent;
let replyTimer, lensTimer;
function chooseWall(choice) {
  clearTimeout(replyTimer); wallChoice = choice; lastScene = -1; peered = false;
  consoleBox.removeAttribute('data-reply');
  consoleBox.classList.add('answered');
  ['quiet', 'knock', 'listen'].forEach(name => select(`#${name}`).setAttribute('aria-pressed', String(choice === name)));
  const answered = choice === 'knock';
  wallText.textContent = answered ? '你敲了两下，停了一会，又敲了一下。' : '你屏住呼吸。敲墙的东西也安静下来。';
  lineState.textContent = answered ? 'TX ·· — ·' : 'LINE MUTED';
  if (answered) knockSound([0, .21, .78]);
  replyTimer = setTimeout(() => {
    select('.receiver').dataset.voice = answered ? '下一声，你来。' : '我听见你了。';
    consoleBox.setAttribute('data-reply', '');
    wallText.textContent = answered ? '同样的三下。这次，声音来自你枕头里面。' : '接线灯亮了。听筒里有人轻声说：“别憋着了。”';
    lineState.textContent = answered ? 'RX ·· — ·  /  INSIDE' : 'LINE 02  /  OCCUPIED';
    if (consoleBox.getBoundingClientRect().bottom > 0) { if (answered) { knockSound([0, .21, .78]); replay(consoleBox, 'knocked'); } else whisper(.5); }
  }, 1500);
  readPage(); renderScroll();
}
select('#knock').onclick = () => chooseWall('knock');
select('#quiet').onclick = () => chooseWall('quiet');

// Hold to press an ear against the wallpaper. Letting go early is allowed.
const listenButton = select('#listen');
const HOLD_TIME = 3200;
let holdStart = 0, holdFrame = 0, holdHushed = false, breathBus;
function startHold() {
  if (holdStart || night.busy) return;
  holdStart = performance.now(); holdHushed = false;
  clearTimeout(replyTimer); consoleBox.removeAttribute('data-reply'); consoleBox.classList.add('holding');
  wallText.textContent = '你把耳朵贴在墙纸上。墙是温的，里面有东西在呼吸。';
  lineState.textContent = 'LINE 01  ·  CONTACT';
  if (audible()) {
    breathBus = context.createGain(); breathBus.connect(master);
    [0, .62, 1.2].forEach((at, index) => burst({ at, length: .52, level: .07 + index * .035, type: 'bandpass', from: index % 2 ? 520 : 780, q: 1.2, attack: .2, out: breathBus }));
  }
  holdFrame = requestAnimationFrame(holdTick);
}
function holdTick(now) {
  const progress = clamp((now - holdStart) / HOLD_TIME);
  consoleBox.style.setProperty('--hold', progress.toFixed(3));
  if (progress > .56 && !holdHushed) { holdHushed = true; wallText.textContent = '呼吸声停了。'; lineState.textContent = 'LINE 01  ·  ——'; duck(0, .15); }
  if (progress < 1) { holdFrame = requestAnimationFrame(holdTick); return; }
  endHold();
  chooseWall('listen'); clearTimeout(replyTimer);
  select('.receiver').dataset.voice = '我听见你了。'; consoleBox.setAttribute('data-reply', '');
  wallText.textContent = '它一直贴在墙的另一面，和你耳朵对着耳朵。';
  lineState.textContent = 'RX  /  YOUR SIDE OF THE WALL';
  replay(consoleBox, 'knocked'); knockSound([0, .08, .16]);
  shout('我听见你了');
}
function endHold() {
  cancelAnimationFrame(holdFrame); holdStart = 0;
  consoleBox.classList.remove('holding'); consoleBox.style.removeProperty('--hold');
  if (breathBus) { breathBus.gain.setTargetAtTime(0, context.currentTime, .03); breathBus = null; }
  unduck();
}
function releaseHold() {
  if (!holdStart) return;
  endHold();
  wallText.textContent = '你把耳朵移开了。墙里的呼吸，还停在原来的位置。';
  lineState.textContent = 'LINE 01  ·  LISTENING';
}
listenButton.addEventListener('pointerdown', event => { if (event.button === 0) { listenButton.setPointerCapture?.(event.pointerId); startHold(); } });
['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(type => listenButton.addEventListener(type, releaseHold));
listenButton.addEventListener('keydown', event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startHold(); } });
listenButton.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') releaseHold(); });
listenButton.addEventListener('contextmenu', event => event.preventDefault());

/* ───────── The peephole ───────── */
const lens = select('#peephole');
let lensStep = 0;
function showLens(step) {
  clearTimeout(lensTimer); lensStep = step;
  lens.classList.toggle('open-eye', step === 2);
  const lensScenes = [
    ['OPTICS 01 · CLEAR', '走廊是空的。', foundPhoto ? '地上放着那张旧照。背面的墨迹还没干。' : '走廊深处，值夜室的灯还亮着。', '再靠近一点'],
    ['OPTICS 02 · NO SIGNAL', '门外没有脚步声。', wallChoice === 'knock' ? '两下，停顿，一下。玻璃从另一侧轻轻震动。' : wallChoice === 'quiet' ? '一层薄雾蒙住玻璃。门外也有人屏着呼吸。' : '猫眼中央出现一小块黑影，遮住了走廊的灯。', '擦去雾气'],
    ['REVERSE FEED · ROOM OCCUPIED', '它也在往里看。', wallChoice === 'knock' ? '这次，三下敲击声从你的门内传来。' : '那不是走廊的灯。是你房间在它瞳孔里的倒影。', '合上猫眼']
  ];
  [select('#lensCode'), select('#lensTitle'), select('#lensText'), select('#lensAction')].forEach((node, index) => node.textContent = lensScenes[step][index]);
  lens.classList.toggle('fogged', step === 1);
  if (step === 1) { duck(.15, .3); knockSound([.25, .46, 1.03]); lensTimer = setTimeout(() => { if (lens.open && !document.hidden) showLens(2); }, 3600); }
  if (step === 2) { peered = true; lastScene = -1; sting(.5); unduck(); renderScroll(); }
}
select('#look').onclick = () => { showLens(0); lens.showModal(); };
select('#lensAction').onclick = () => lensStep === 2 ? lens.close() : showLens(lensStep + 1);
lens.addEventListener('close', () => { clearTimeout(lensTimer); unduck(); lens.style.removeProperty('--gaze'); renderScroll(); });
lens.addEventListener('pointermove', event => { if (!reducedMotion.matches) lens.style.setProperty('--gaze', `${(event.clientX / innerWidth - .5) * 16}px`); });

/* ───────── Leaving ───────── */
function leave() {
  consoleBox.removeAttribute('data-reply');
  clearTimeout(captionTimer); shownCue = -1; tapeMessage.textContent = '';
  clearTimeout(replyTimer); showPhoto(-photoIndex); entryIndex = 0; wallChoice = ''; foundPhoto = false; peered = false; lastScene = -1;
  consoleBox.classList.remove('answered'); wallText.textContent = initialWallText; lineState.textContent = 'LINE 01 · LISTENING';
  selectAll('.wall-choices button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  flipPhoto(false); readPage(); window.scrollTo({ top: 0, behavior: 'instant' }); select('.brand').focus({ preventScroll: true }); renderScroll();
  // Nobody checks out. The first page has been rewritten by the time you get back to it.
  if (night.scared && !night.returned) {
    night.returned = true; root.classList.add('returned');
    heroDoor.textContent = doorText();
    select('#heroCopy').innerHTML = '你以为自己已经离开了。<br>北翼 317 号房的登记簿上，今晚写着两个名字。';
    setTimeout(() => murmur('欢迎回来。', 4200), 1500);
  }
}
// You are not let out before you have seen it.
select('#escape').onclick = () => canScare() ? finale(true) : leave();

/* ───────── Things that happen when you are not doing anything ───────── */
let idleTimer, idleCount = 0;
function armIdle() {
  clearTimeout(idleTimer);
  if (idleCount >= 2) return;
  idleTimer = setTimeout(() => {
    if (night.entered && !night.busy && !document.hidden && !dialogOpen() && night.fear > .12) {
      idleCount++; knockSound([0, .21, .78]); murmur(idleCount === 1 ? '你还在吗？' : '它也在等。');
    }
    armIdle();
  }, 26000);
}
['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(type => window.addEventListener(type, armIdle, { passive: true }));
function strayTear() {
  setTimeout(strayTear, between(11000, 24000));
  if (night.entered && !night.busy && !document.hidden && !dialogOpen() && night.fear > .38) tear(.5);
}
const pageTitle = document.title;
let awayTimer, wasAway = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (master) master.gain.setTargetAtTime(0, context.currentTime, .12);
    if (night.entered) { wasAway = true; document.title = '你去哪了？'; awayTimer = setTimeout(() => { document.title = '它还在走廊里。'; }, 5000); }
    return;
  }
  clearTimeout(awayTimer); document.title = pageTitle;
  if (soundOn) master.gain.setTargetAtTime(MASTER_LEVEL, context.currentTime, .45);
  if (wasAway) { wasAway = false; setTimeout(() => { if (!night.busy && !dialogOpen()) { tear(.8); whisper(); murmur('你不在的时候，它往前走了一步。'); } }, 600); }
});

/* ───────── The gate ───────── */
const gate = select('#gate');
function describeNight() {
  const now = new Date(), clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (now.getHours() === 3 && now.getMinutes() >= 17) return `现在是 ${clock}。你来得正是时候。`;
  const due = new Date(now); due.setHours(3, 17, 0, 0);
  if (due <= now) due.setDate(due.getDate() + 1);
  const minutes = Math.round((due - now) / 60000);
  return `现在是 ${clock} · 距凌晨 03:17 还有 ${Math.floor(minutes / 60)} 小时 ${pad(minutes % 60)} 分`;
}
async function enter(withSound) {
  if (night.entered) return;
  night.entered = true;
  if (withSound) { await setSound(true); creak(); }
  if (gate.open) {
    gate.classList.add('leaving');
    await wait(reducedMotion.matches ? 0 : 1500);
    gate.close(); gate.classList.remove('leaving');
  }
  onDwell(select('#estateLine'), 1, 2600, () => { const line = select('#estateLine'); scrambleTo(line, '这里的每一位住客，都没有办理过退房。'); line.classList.add('bled'); });
  onDwell(consoleBox, .6, 700, () => { if (!wallChoice && !holdStart) { knockSound([0, .21, .78]); replay(consoleBox, 'knocked'); } });
  watchRoom(); armIdle(); renderScroll();
  setTimeout(glitchTitle, 9000); setTimeout(strayTear, 12000);
}
select('#gateClock').textContent = describeNight();
select('#enterLoud').onclick = () => enter(true);
select('#enterMute').onclick = () => enter(false);
gate.addEventListener('cancel', event => { event.preventDefault(); enter(false); });
renderScroll();
if (gate.showModal) gate.showModal(); else enter(false);
