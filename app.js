import { STORAGE_KEY, TYPES, STAGES, fresh, begin, advance, visit, editScheme, undoScheme, insert, move, finish, nextCycle, restore } from './logic.js';
const TITLE = 'Играем в слова';
const names = { subject: 'Предмет', attribute: 'Признак', action: 'Действие', preposition: 'Предлог' };
const labels = ['Назови предмет', 'Назови признаки', 'Назови действия', 'Составь предложение'];
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
let cards, state, view = 'welcome', notice = '', storageError = '', corruptRaw = null, storageBlocked = false;
let selectedType = 'subject', selectedInstance = null, hintOpen = false, exampleSchemeOpen = false, wrongChoice = null;
let drag = null, offline = 'Материалы готовы для работы без сети.';
let lastFocus;
const icon = (name) => {
 const paths = { home:'<path d="m3 11 9-8 9 8v10h-7v-7h-4v7H3Z"/>', sound:'<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>', mute:'<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="m17 9 5 6m0-6-5 6"/>', arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', check:'<path d="m5 12 5 5L20 6"/>', star:'<path d="m12 3 2.5 5.5 6 .7-4.5 4 1.3 6-5.3-3-5.3 3 1.3-6-4.5-4 6-.7Z"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>', replay:'<path d="M4 10a8 8 0 1 1 0 6M4 4v6h6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>', lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>' };
 return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
};
export function shape(type, first = false) {
 const count = {subject:1,action:2,attribute:3}[type] || 0;
 const lines = Array.from({length:count}, (_,i) => { const x = 55 - (count-1)*9 + i*18; return `<path d="M${x-16} 58 ${x+18} 18"/>`; }).join('');
 return `<svg class="shape" viewBox="0 0 112 76" role="img" aria-label="${names[type]}${first ? ', начало предложения' : ''}"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">${first ? '<path d="M17 59V4"/>' : ''}${type === 'preposition' ? '<path d="M22 18v40h66Z"/>' : `<rect x="17" y="18" width="88" height="40" rx="2"/>${lines}`}</g></svg>`;
}
let currentAudio = null;
const voiceFiles = { welcome:'welcome.mp3', subject:'subject.mp3', retry:'retry.mp3', attributes:'attributes.mp3', actions:'actions.mp3', sentence:'sentence.mp3', hint:'hint.mp3', happy:'happy.mp3', again:'again.mp3', bye:'bye.mp3', 'all-done':'all-done.mp3' };
function say(message) { document.querySelector('#announcer').textContent = message; }
function playVoice(id) { if (!state?.settings.sound || !voiceFiles[id]) return; currentAudio?.pause(); currentAudio = new Audio(`media/voice/${voiceFiles[id]}`); currentAudio.play().catch(()=>{}); }
function playCurrentStageVoice() { if (view !== 'game' || !state?.activeRound) return; playVoice(['subject','attributes','actions','sentence'][state.activeRound.stage || 0]); }
function save() {
 if (storageBlocked) return;
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageError = ''; }
 catch { storageError = 'Сохранение недоступно. Игра продолжится, но после закрытия прогресс может потеряться.'; }
}
function change(next) { state = next; save(); render(); }
function updateRound(values) { change({ ...state, activeRound: { ...state.activeRound, ...values } }); }
function imageCard(file, key, word, options = {}) {
 const revealed = state.activeRound.revealedLabels.includes(key);
 const selected = options.select && state.activeRound[options.select] === word;
 const cardId = state.activeRound.cardId;
 return `<article class="word-card ${selected ? 'chosen' : ''}"><button class="picture" data-action="zoom" data-file="${file}" aria-label="Увеличить картинку${revealed ? ': '+escape(word) : ''}"><img src="media/cards/${cardId}/${file}.webp" alt="${revealed ? escape(word) : 'Картинка для обсуждения'}"><span class="zoom-mark" aria-hidden="true">＋</span></button><div class="card-caption">${revealed ? `<span class="word">${escape(word)}</span><button class="text-button" data-action="reveal" data-key="${key}">Скрыть слово</button>` : `<button class="reveal-button" data-action="reveal" data-key="${key}">Показать слово</button>`}${options.select ? `<button class="choice-button ${selected ? 'selected' : ''}" data-action="choose" data-field="${options.select}" data-word="${escape(word)}" aria-pressed="${!!selected}">${selected ? icon('check')+' Выбрано' : 'Выбрать'}</button>` : ''}</div></article>`;
}
function header() {
 return `<header class="topbar"><button class="brand" data-action="home" aria-label="На главный экран"><span class="brand-flower" aria-hidden="true">✿</span><span>${TITLE}<small>со Стёпой</small></span></button><div class="top-actions"><span class="prototype">Офлайн-игра</span><button class="icon-button" data-action="sound" aria-label="${state.settings.sound ? 'Выключить звук' : 'Включить звук'}" title="Включить или выключить озвучку">${icon(state.settings.sound ? 'sound':'mute')}</button><button class="adult-button" data-action="adult" aria-label="Для взрослого">${icon('settings')}<span>Для взрослого</span></button></div></header>`;
}
function footer() { return `<footer><span>В своём темпе, вместе со взрослым</span><a href="gallery.html" target="_blank" rel="noopener">Посмотреть иллюстрации ${icon('arrow')}</a></footer>`; }
function cover() {
 const completed = state.completedIds.length > 0;
 const exhausted = cards?.length > 0 && state.completedIds.length >= cards.length && !state.activeRound;
 const label = exhausted ? 'Начать новый круг' : state.activeRound ? 'Продолжить' : completed ? 'Играть дальше' : 'Играть';
 return `<main class="cover"><section class="cover-copy"><div class="eyebrow"><span class="little-dot"></span> МАЛЕНЬКИЕ ОТКРЫТИЯ КАЖДЫЙ ДЕНЬ</div><h1>У каждого слова<br>своя <span>история.</span></h1><p class="cover-lead">Называем, замечаем, придумываем.<br>И собираем предложения со Стёпой!</p><div class="welcome-note"><span class="note-flower" aria-hidden="true">✿</span><p>Привет! Я Стёпа. Давай играть в слова<br>и собирать предложения!</p></div><div class="cover-buttons"><button class="primary" data-action="${exhausted ? 'new-cycle' : 'play'}">${label} ${icon('arrow')}</button>${state.activeRound ? '<span class="saved-note">Ваше задание сохранено</span>' : '<span class="saved-note">Для детей 6–7 лет<br>и любопытных взрослых</span>'}</div>${completed ? `<p class="completion-note">${exhausted ? 'Мы поиграли со всеми 16 темами! Можно начать новый круг.' : `Завершено тем: ${state.completedIds.length} из ${cards.length}.`}</p>` : ''}</section><section class="cover-art" aria-label="Стёпа приветствует вас"><span class="petal petal-one" aria-hidden="true">✦</span><span class="petal petal-two" aria-hidden="true">✦</span><div class="bunny-halo"></div><img class="cover-bunny" src="media/stepa/welcome.webp" alt="Белый зайчик Стёпа в сиреневом комбинезоне машет лапкой"><div class="hello-sticker">Давай играть!</div></section><section class="journey" aria-label="Четыре шага игры">${labels.map((x,i)=>`<div class="journey-step step-${i}"><span class="step-number">${i+1}</span><div><strong>${x}</strong><span>${['Кто это? Что это?','Какой? Какая? Какое?','Что делает?','Придумаем вместе'][i]}</span></div>${i<3 ? '<span class="journey-arrow" aria-hidden="true">›</span>':''}</div>`).join('')}</section></main>`;
}
function pyramid() {
 const r = state.activeRound;
 const pyramidLabels = ['Предмет', 'Признаки', 'Действия', 'Предложение'];
 return `<nav class="pyramid-panel" aria-label="Этапы игры"><div class="pyramid">${pyramidLabels.map((text,i)=>`<button class="tier tier-${i} ${r.stage===i?'active':''}" data-action="stage" data-stage="${i}" ${i>r.unlocked?'disabled title="Сначала верхняя ступенька"':''} ${r.stage===i?'aria-current="step"':''}><span>${text}</span>${i>r.unlocked?icon('lock'): i<r.unlocked?icon('check'):''}</button>`).join('')}</div><p class="pyramid-note">Шаг за шагом —<br>к своему предложению</p><button class="home-link" data-action="home">${icon('home')} На главный экран</button></nav>`;
}
function helper(stage, card) {
 const text = ['Посмотри на картинку.<br>Кто это или что это?', 'Расскажи, какой он, какая она или какое оно.<br>Посмотри на три картинки.', `${card.actions.length===2?'Назови два действия.':'Назови три действия.'}<br>Что делает наш герой или предмет? Посмотри на картинки.`, 'Придумай предложение.<br>А теперь соберём его схему!'][stage];
 return `<aside class="helper"><div class="speech">${text}<button class="repeat" data-action="repeat">${icon('replay')} Повторить</button></div><img src="media/stepa/${hintOpen?'hint':'attentive'}.webp" alt="Стёпа внимательно слушает"><span class="helper-note">Я рядом!</span></aside>`;
}
function taskHeading(stage, card) { const pronoun = card?.gender === 'f' ? 'она' : card?.gender === 'n' ? 'оно' : 'он'; const actionCount = card?.actions?.length || 3; return `<div class="task-heading"><div class="eyebrow">ШАГ ${stage+1} ИЗ 4</div><h1 tabindex="-1" id="task-title">${['Назови предмет','Назови признаки','Назови действия','Составь предложение'][stage]}</h1><p>${['Назови картинку, затем выбери подходящий вопрос.','Рассмотри три картинки и назови три признака.',`Назови ${actionCount === 2 ? 'два' : 'три'} действия. Стёпа внимательно слушает.`,'Выбери один признак и одно действие.'][stage]}</p></div>`; }
function questions(items, correct, answered, field) {
 return `<div class="question-buttons">${items.map(q=>`<button class="question ${answered && q===correct?'correct':''}${wrongChoice===field+':'+q?' wrong':''}" data-action="answer" data-field="${field}" data-answer="${escape(q)}" ${answered?'disabled':''}>${q}${answered&&q===correct?icon('check'):''}</button>`).join('')}</div>`;
}
function task() {
 const r = state.activeRound, card = cards.find(c => c.id === r.cardId), stage = r.stage;
 let body;
 if (stage===0) body=`<div class="subject-card">${imageCard('subject','subject',card.noun)}</div>${questions(['Кто это?','Что это?'],card.animate?'Кто это?':'Что это?',r.answers.subject,'subject')}${r.answers.subject?`<div class="symbol-note">${shape('subject')}<span>Так обозначим предмет</span></div>`:''}`;
 if (stage===1) body=`<div class="three-cards">${card.attributes.map((a,i)=>imageCard('attribute-'+(i+1),'attribute-'+i,a.word)).join('')}</div>${questions(['Какой?','Какая?','Какое?','Какие?'],card.question,r.answers.attributes,'attributes')}<div class="symbol-note">${shape('attribute')}<span>Три чёрточки — признак</span></div>`;
 if (stage===2) body=`<div class="three-cards">${card.actions.map((a,i)=>imageCard('action-'+(i+1),'action-'+i,a)).join('')}</div><div class="question-static">Что делает?</div><div class="symbol-note">${shape('action')}<span>Две чёрточки — действие</span></div>`;
 if (stage===3) body=`<div class="selection-section"><h2>Один признак</h2><div class="three-cards compact">${card.attributes.map((a,i)=>imageCard('attribute-'+(i+1),'attribute-'+i,a.word,{select:'selectedAttribute'})).join('')}</div><h2>Одно действие</h2><div class="three-cards compact">${card.actions.map((a,i)=>imageCard('action-'+(i+1),'action-'+i,a,{select:'selectedAction'})).join('')}</div></div>`;
 const canNext = stage===0?r.answers.subject:stage===1?r.answers.attributes:true;
 return `<main class="game-layout stage-${stage}">${pyramid()}<section class="task">${taskHeading(stage, card)}${body}<p class="feedback" role="status">${escape(notice)}</p>${stage<3?`<div class="task-bottom"><span>${['Ответ слушает взрослый','Обсудили все три признака?','Обсудили все три действия?'][stage]}</span><button class="primary" data-action="next" ${canNext?'':'disabled'}>Дальше ${icon('arrow')}</button></div>`:''}</section>${helper(stage, card)}${stage===3?sentence(card):''}</main>`;
}
function sentence(card) {
 const r = state.activeRound;
 if (!r.selectedAttribute || !r.selectedAction) return `<section class="scheme-section pending-scheme"><p>После выбора признака и действия здесь появятся место и поле для схемы.</p></section>`;
 const selected = r.scheme.findIndex(x=>x.instanceId===selectedInstance);
 return `<section class="scheme-section"><div class="sentence-intro"><div><div class="eyebrow">ТЕПЕРЬ СОЕДИНИМ СЛОВА</div><h2>Твоя история</h2><p>Добавь место. Произнеси предложение вслух.</p><div class="selected-words"><span>${escape(r.selectedAttribute)}</span><span>${escape(card.noun)}</span><span>${escape(r.selectedAction)}</span></div><small>Можно придумать свою фразу — взрослый поможет.</small></div><div class="context-card">${imageCard('context','context',card.context.nounForm)}<span class="preposition-chip">${card.context.preposition}</span></div></div><div class="scheme-heading"><div><h2>Соберём схему</h2><p>Перетаскивай фигуры или выбирай и добавляй кнопкой.</p></div><button class="hint-button" data-action="hint" aria-expanded="${hintOpen}">${icon('star')} ${hintOpen?'Скрыть подсказку':'Подсказка'}</button></div><div class="palette" aria-label="Типы слов">${TYPES.map(type=>`<button class="palette-item ${selectedType===type?'selected':''}" data-action="type" data-type="${type}" draggable="true" aria-pressed="${selectedType===type}">${shape(type)}<span>${names[type]}</span></button>`).join('')}<button class="add-button" data-action="add">＋ Добавить</button></div><div class="scheme-field" aria-label="Свободная схема предложения">${r.scheme.length?r.scheme.map((s,i)=>`<button class="insertion" data-action="insert" data-index="${i}" aria-label="Вставить ${names[selectedType].toLowerCase()} перед фигурой ${i+1}" title="Вставить сюда">+</button><button class="scheme-piece ${selectedInstance===s.instanceId?'selected':''}" data-action="select-piece" data-id="${s.instanceId}" data-index="${i}" draggable="true" aria-pressed="${selectedInstance===s.instanceId}" aria-label="Фигура ${i+1}: ${names[s.type]}">${shape(s.type,i===0)}<span>${i+1}</span></button>`).join('')+`<button class="insertion" data-action="insert" data-index="${r.scheme.length}" aria-label="Вставить в конец">+</button><span class="period" aria-label="Точка">.</span>`:`<button class="empty-scheme" data-action="add" data-index="0"><span aria-hidden="true">＋</span> Здесь начнётся твоё предложение<small>Добавь первую фигуру</small></button>`}</div><div class="scheme-tools"><div><button data-action="left" ${selected<=0?'disabled':''}>← Влево</button><button data-action="right" ${selected<0||selected===r.scheme.length-1?'disabled':''}>Вправо →</button><button data-action="remove" ${selected<0?'disabled':''}>Удалить</button></div><div><button data-action="undo" ${r.undo.length?'':'disabled'}>↶ Отменить</button><button data-action="clear" ${r.scheme.length?'':'disabled'}>Очистить</button></div></div>${hintOpen?`<section class="example-panel"><img src="media/cards/${card.id}/example.webp" alt="${escape(card.example.text)}"><div><div class="eyebrow">ОДИН ИЗ ВАРИАНТОВ</div><h3>${escape(card.example.text)}</h3><p>А ты можешь придумать свой! Этот пример может отличаться от выбранных слов.</p><button class="secondary" data-action="example-scheme" aria-expanded="${exampleSchemeOpen}">${exampleSchemeOpen?'Скрыть':'Показать'} схему примера</button>${exampleSchemeOpen?`<div class="example-scheme" aria-label="Схема примера">${card.example.tokens.map((t,i)=>`<span>${shape(t.type,i===0)}<small>${escape(t.word)}</small></span>`).join('')}<span class="period">.</span></div>`:''}</div></section>`:''}<div class="task-bottom"><span>Обсудили предложение и схему?</span><button class="primary" data-action="finish" ${r.scheme.length?'':'disabled'}>Готово ${icon('check')}</button></div><p class="adult-caption">Завершение подтверждает взрослый. Здесь нет автоматической проверки фразы.</p></section>`;
}
function celebration() { const exhausted = state.completedIds.length >= cards.length; return `<main class="celebration"><div class="celebration-copy"><div class="eyebrow">МЫ ПРИДУМАЛИ СВОЮ ИСТОРИЮ</div><h1>Ура!<br><span>Получилось!</span></h1><p>Спасибо, что поиграл со мной!</p><div class="celebration-flower" aria-hidden="true">✿</div><p class="prototype-done">Тема завершена и сохранена.<br>Пройдено карточек: ${state.completedIds.length} из ${cards.length}.</p><div class="cover-buttons"><button class="primary" data-action="${exhausted ? 'new-cycle' : 'continue'}">${exhausted ? 'Начать новый круг' : 'Ещё поиграем'} ${icon('arrow')}</button><button class="secondary" data-action="home">Закончить</button></div></div><img class="happy-bunny" src="media/stepa/happy.webp" alt="Стёпа радуется вашему предложению"></main>`; }
function render() {
 const focus = document.activeElement?.closest('[data-action]');
 const action = focus?.dataset.action, key = focus?.dataset.key, id = focus?.dataset.id;
 const reduce = state.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
 document.documentElement.classList.toggle('reduce-motion',reduce);
 app.innerHTML = `<div class="shell">${header()}${storageError?`<div class="warning" role="alert">${escape(storageError)}</div>`:''}${view==='welcome'?cover():view==='celebration'?celebration():task()}${footer()}</div>`;
 if (view === 'welcome') { const greeting = app.querySelector('.welcome-note p'); if (greeting) greeting.innerHTML = 'Привет! Я Стёпа, твой помощник.<br>Давай играть в слова и собирать предложения!'; }
 if(action){ const match=[...app.querySelectorAll('[data-action]')].find(el=>el.dataset.action===action&&(!key||el.dataset.key===key)&&(!id||el.dataset.id===id));match?.focus({preventScroll:true}); }
 app.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{ const fallback=document.createElement('div');fallback.className='missing-image';fallback.textContent='Картинка не загрузилась. Попробуйте открыть игру заново.';img.replaceWith(fallback);},{once:true}));
}
function focusHeading() { requestAnimationFrame(()=>document.querySelector('#task-title, main h1')?.focus({preventScroll:true})); }
function dialog(html) { lastFocus=document.activeElement; modal.innerHTML=`<button class="dialog-close icon-button" data-action="close" aria-label="Закрыть">${icon('close')}</button>${html}`;modal.showModal(); }
function closeDialog() { modal.close();lastFocus?.focus(); }
function confirmDialog(title, description, action, label) { dialog(`<h2>${title}</h2><p>${description}</p><div class="dialog-actions"><button class="secondary" data-action="close">Отмена</button><button class="primary" data-action="${action}">${label}</button></div>`); }
function adult() { dialog(`<div class="eyebrow">ДЛЯ ВЗРОСЛОГО</div><h2>Играем вместе</h2><p>Ребёнок отвечает вслух, а вы открываете слова и переходите дальше. Любой подходящий устный ответ можно обсудить. Схема остаётся свободной.</p><label class="setting"><input type="checkbox" data-setting="sound" ${state.settings.sound?'checked':''}> Звук включён, когда озвучка будет готова</label><p class="small-note">В этом прототипе голос ещё не записан. Кнопка «Повторить» показывает реплику текстом.</p><label class="setting"><input type="checkbox" data-setting="reducedMotion" ${state.settings.reducedMotion?'checked':''}> Уменьшить анимацию</label><h3>Материалы и сохранение</h3><p id="offline-status">${escape(offline)}</p><button class="secondary" data-action="offline">Сохранить / проверить материалы</button><p class="small-note">Сохраняется только прогресс этого браузера. Очистка данных браузера удаляет его. Это прототип с одной темой, без озвучки; полный офлайн-выпуск ещё не готов.</p><a href="gallery.html" target="_blank" rel="noopener">Все иллюстрации прототипа →</a><div class="adult-reset"><button class="text-button danger" data-action="reset">Сбросить прогресс</button></div>`); }
function adult() { dialog(`<div class="eyebrow">ДЛЯ ВЗРОСЛОГО</div><h2>Играем вместе</h2><p>Ребёнок отвечает вслух, а вы открываете слова и переходите дальше. Любой подходящий устный ответ можно обсудить. Схема остаётся свободной.</p><label class="setting"><input type="checkbox" data-setting="sound" ${state.settings.sound?'checked':''}> Озвучка Стёпы включена</label><label class="setting"><input type="checkbox" data-setting="reducedMotion" ${state.settings.reducedMotion?'checked':''}> Уменьшить анимацию</label><h3>Материалы и сохранение</h3><p id="offline-status">${escape(offline)}</p><button class="secondary" data-action="offline">Проверить офлайн-материалы</button><p class="small-note">Прогресс сохраняется в этом браузере.</p><a href="gallery.html" target="_blank" rel="noopener">Иллюстрации игры →</a><div class="adult-reset"><button class="text-button danger" data-action="reset">Сбросить прогресс</button></div>`); }
function addPiece(index = state.activeRound.scheme.length) {
 const id=crypto.randomUUID(); selectedInstance=id;
 change(editScheme(state,insert(state.activeRound.scheme,selectedType,index,id)));say('Добавлена фигура: '+names[selectedType]);
}
function moveSelected(delta) { const scheme=state.activeRound.scheme;const i=scheme.findIndex(x=>x.instanceId===selectedInstance);change(editScheme(state,move(scheme,i,i+delta)));say('Фигура перемещена'); }
function doAction(el) {
 const a=el.dataset.action, r=state.activeRound;
 if(a==='home'){view='welcome';notice='';render();return;}
 if(a==='continue'){view='game';state=begin(state,cards);notice='';hintOpen=false;exampleSchemeOpen=false;save();render();focusHeading();playCurrentStageVoice();return;}
 if(a==='play'){state=begin(state,cards);view=state.activeRound?'game':'welcome';hintOpen=false;exampleSchemeOpen=false;notice='';save();render();focusHeading();playCurrentStageVoice();return;}
 if(a==='stage'){state=visit(state,Number(el.dataset.stage));notice='';save();render();focusHeading();playCurrentStageVoice();return;}
 if(a==='next'){state=advance(state);notice='';save();render();focusHeading();playCurrentStageVoice();return;}
 if(a==='answer'){ const field=el.dataset.field;const card=cards.find(c=>c.id===r.cardId);const correct=field==='subject'?(card.animate?'Кто это?':'Что это?'):card.question; if(el.dataset.answer===correct){wrongChoice=null;notice='Верно! Теперь можно продолжить.';updateRound({answers:{...r.answers,[field]:true}});}else{wrongChoice=field+':'+el.dataset.answer;notice='Давай подумаем ещё немного.';render();playVoice('retry');}return; }
 if(a==='reveal'){const key=el.dataset.key;updateRound({revealedLabels:r.revealedLabels.includes(key)?r.revealedLabels.filter(x=>x!==key):[...r.revealedLabels,key]});return;}
 if(a==='choose'){updateRound({[el.dataset.field]:el.dataset.word});say('Выбор сохранён');return;}
 if(a==='zoom'){dialog(`<div class="zoomed"><img src="media/cards/${r.cardId}/${el.dataset.file}.webp" alt="Увеличенная картинка для обсуждения"></div>`);return;}
 if(a==='type'){selectedType=el.dataset.type;render();return;}
 if(a==='add'||a==='insert'){addPiece(a==='insert'?Number(el.dataset.index):undefined);return;}
 if(a==='select-piece'){selectedInstance=el.dataset.id;render();return;}
 if(a==='left'||a==='right'){moveSelected(a==='left'?-1:1);return;}
 if(a==='remove'){change(editScheme(state,r.scheme.filter(s=>s.instanceId!==selectedInstance)));selectedInstance=null;say('Фигура удалена');return;}
 if(a==='undo'){change(undoScheme(state));say('Последнее изменение отменено');return;}
 if(a==='clear'){confirmDialog('Очистить схему?','Все фигуры будут убраны. Очистку можно отменить.','confirm-clear','Очистить');return;}
 if(a==='confirm-clear'){closeDialog();selectedInstance=null;change(editScheme(state,[]));return;}
 if(a==='hint'){hintOpen=!hintOpen;render();return;}
 if(a==='example-scheme'){exampleSchemeOpen=!exampleSchemeOpen;render();return;}
 if(a==='finish'){const next=finish(state);if(next!==state){view='celebration';change(next);window.scrollTo({top:0,behavior:'instant'});playVoice('happy');}return;}
 if(a==='new-cycle'){confirmDialog('Начать новый круг?','Пройденные темы будут снова доступны; настройки сохранятся.','confirm-cycle','Начать новый круг');return;}
 if(a==='confirm-cycle'){closeDialog();view='game';notice='';hintOpen=false;exampleSchemeOpen=false;selectedInstance=null;change(begin(nextCycle(state),cards));focusHeading();playCurrentStageVoice();return;}
 if(a==='adult'){adult();return;}
 if(a==='sound'){state.settings.sound=!state.settings.sound;save();render();if(state.settings.sound)playVoice(view==='welcome'?'welcome':view==='celebration'?'happy':(['subject','attributes','actions','sentence'][r?.stage||0]));say(state.settings.sound?'Озвучка включена':'Озвучка выключена');return;}
 if(a==='repeat'){const voiceId=view==='welcome'?'welcome':(['subject','attributes','actions','sentence'][r?.stage||0]);playVoice(voiceId);dialog(`<h2>Стёпа говорит</h2><p class="repeated-line">${['Посмотри на картинку. Кто это или что это?','Расскажи, какой он, какая она или какое оно. Посмотри на три картинки.','Что делает наш герой или предмет? Посмотри на картинки.','Придумай предложение. А теперь соберём его схему!'][r?.stage||0]}</p><p class="small-note">Реплика воспроизводится локально из файла проекта.</p>`);return;}
 if(a==='reset'){closeDialog();confirmDialog('Сбросить прогресс?','Текущее задание и завершения будут удалены.','confirm-reset','Сбросить');return;}
 if(a==='confirm-reset'){closeDialog();state={...fresh(),settings:state.settings};storageBlocked=false;view='welcome';save();render();return;}
 if(a==='close'){closeDialog();return;}
 if(a==='offline'){prepareOffline();return;}
 if(a==='download-save'){const blob=new Blob([corruptRaw||''],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='stepa-save-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return;}
 if(a==='recover-reset'){closeDialog();state=fresh();storageBlocked=false;storageError='';save();render();return;}
 if(a==='temporary'){closeDialog();storageBlocked=true;storageError='Старое сохранение оставлено без изменений. Это занятие не сохраняется.';render();return;}
}
document.addEventListener('click', e=>{const el=e.target.closest('[data-action]');if(el&&!el.disabled)doAction(el);});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
document.addEventListener('change',e=>{if(e.target.dataset.setting){state.settings[e.target.dataset.setting]=e.target.checked;save();render();}});
document.addEventListener('keydown',e=>{const piece=e.target.closest('.scheme-piece');if(piece&&['ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.key)){e.preventDefault();selectedInstance=piece.dataset.id;if(e.key.startsWith('Arrow'))moveSelected(e.key==='ArrowLeft'?-1:1);else doAction({dataset:{action:'remove'}});}});
document.addEventListener('dragstart',e=>{const el=e.target.closest('[draggable="true"]');if(!el)return;drag=el.dataset.type?{type:el.dataset.type}:{id:el.dataset.id};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed=drag.id?'move':'copy';});
document.addEventListener('dragover',e=>{const target=e.target.closest('.insertion,.scheme-piece,.empty-scheme,.scheme-field');if(target&&drag){e.preventDefault();target.classList.add('drag-over');}});
document.addEventListener('dragleave',e=>e.target.closest('.drag-over')?.classList.remove('drag-over'));
document.addEventListener('dragend',()=>{drag=null;document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));});
document.addEventListener('drop',e=>{const target=e.target.closest('.insertion,.scheme-piece,.empty-scheme,.scheme-field');if(!target||!drag||!state.activeRound)return;e.preventDefault();const scheme=state.activeRound.scheme;let index=target.dataset.index===undefined?scheme.length:Number(target.dataset.index);if(drag.type){selectedType=drag.type;addPiece(index);}else{const from=scheme.findIndex(x=>x.instanceId===drag.id);if(from>=0){if(from<index)index--;selectedInstance=drag.id;change(editScheme(state,move(scheme,from,Math.min(index,scheme.length-1))));}}drag=null;});
async function prepareOffline() {
 offline='Проверяем и сохраняем материалы прототипа…'; if(modal.querySelector('#offline-status'))modal.querySelector('#offline-status').textContent=offline;
 try {
  if(!('serviceWorker' in navigator))throw new Error('Service workers unavailable');
  await navigator.serviceWorker.register('./sw.js');
  const registration=await navigator.serviceWorker.ready;
  const result = await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('Timeout')),60000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.ok?resolve(e.data):reject(new Error(e.data.error));};registration.active.postMessage({type:'PREPARE'},[channel.port2]);});
  offline=result.missing?.length ? `Оболочка сохранена для запуска без сети. Не готовы медиа: ${result.missing.length} из 148. Полный офлайн-выпуск ещё не подтверждён.` : 'Все обязательные материалы сохранены для запуска без сети. Озвучка пока не подготовлена.';
 } catch { offline='Не удалось сохранить все материалы. Проверьте соединение и повторите загрузку. Полный офлайн-режим не подтверждён.'; }
 if(modal.querySelector('#offline-status'))modal.querySelector('#offline-status').textContent=offline;
 say(offline);
}
async function init() {
 try { const res=await fetch('./content/cards.json');if(!res.ok)throw new Error('Cards missing');cards=(await res.json()).cards;if(cards.length!==16||cards.filter(c=>c.animate).length!==8||cards.filter(c=>!c.animate).length!==8||!cards.some(c=>c.id==='fox'))throw new Error('Wrong card set'); }
 catch {
  const fileMode = location.protocol === 'file:';
  app.innerHTML=`<main class="loading"><h1>Игра не запустилась</h1><p>${fileMode ? 'HTML-файл открыт напрямую. Для загрузки карточек нужен локальный сервер.' : 'Не удалось загрузить карточки. Проверьте, что папка проекта запущена через локальный сервер.'}</p>${fileMode?'<p><strong>Как запустить:</strong> в папке проекта выполните <code>npm start</code>, затем откройте <code>http://localhost:4173</code>.</p>':''}<button onclick="location.reload()">Повторить</button></main>`;
  return;
 }
 try {corruptRaw=localStorage.getItem(STORAGE_KEY);state=restore(corruptRaw,cards);}catch{state=fresh();storageBlocked=true;storageError='Не удалось прочитать сохранение. Старые данные не перезаписаны.';}
 render();
 if(storageBlocked){dialog('<h2>Сохранение не удалось открыть</h2><p>Можно скачать исходные данные, затем начать заново, или поиграть без сохранения. Старое сохранение пока не изменено.</p><div class="recovery-actions"><button class="secondary" data-action="download-save">Скачать копию</button><button class="secondary" data-action="temporary">Играть без сохранения</button><button class="primary" data-action="recover-reset">Начать заново</button></div>');}
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init();
