// Building-block library: self-contained HTML/CSS/JS examples in the MuDiKo design.
// Teachers hand them to AI Studio as context; the sandboxed preview page renders them.
// Plain script (no import/export) so both the side panel and preview.html can load it.
globalThis.MUDIKO_TEMPLATES = [
  {
    id: 'lernpfad',
    title: 'Lernpfad-Grundgerüst',
    summary: 'Schritte als Karten mit Sektionsfarben, Fortschrittspunkten und Weiter/Zurück.',
    tags: ['Lernpfad', 'Navigation'],
    usage: 'Grundgerüst für einen Lernpfad: Schritte als Karten, je Schritt eine Signaturfarbe, Fortschrittspunkte und Weiter/Zurück-Navigation.',
    html: `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lernpfad-Grundgerüst</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #020617; color: #e2e8f0; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { width: min(680px, 100%); padding: 20px; border-radius: 16px; background: rgba(15, 23, 42, 0.9); border: 1px solid #1e293b; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 14px; margin-bottom: 16px; border-bottom: 1px solid #1e293b; }
  .pill { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
  h2 { margin: 2px 0 0; font-size: clamp(18px, 3vw, 24px); color: #f8fafc; }
  .dots { display: flex; gap: 6px; padding-top: 8px; }
  .dot { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 99px; background: #334155; cursor: pointer; transition: width 0.2s; }
  .dot.active { width: 24px; background: var(--accent); }
  .text-card { padding: 16px; border-radius: 12px; background: rgba(2, 6, 23, 0.9); border: 1px solid #1e293b; }
  .text-card p { margin: 0; }
  .merksatz { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: #0f172a; border: 1px solid #1e293b; }
  .nav { display: flex; justify-content: space-between; margin-top: 16px; }
  button.action { min-height: 44px; padding: 10px 18px; border-radius: 12px; font: inherit; font-weight: 600; white-space: nowrap; cursor: pointer; }
  .primary { color: #0f172a; background: var(--accent-strong); border: 0; }
  .secondary { color: #cbd5e1; background: #0f172a; border: 1px solid #1e293b; }
  button:disabled { opacity: 0.4; cursor: default; }
</style>
</head>
<body>
<main class="card" id="app">
  <div class="header">
    <div><div class="pill" id="pill"></div><h2 id="title"></h2></div>
    <div class="dots" id="dots"></div>
  </div>
  <div class="text-card" id="content"></div>
  <div class="nav">
    <button class="action secondary" id="back">Zurück</button>
    <button class="action primary" id="next">Weiter</button>
  </div>
</main>
<script>
  // Pro Schritt: Name, Signaturfarbe (hell, kräftig), Überschrift, Text, optional ein Merksatz.
  var steps = [
    { name: 'Entdecken', color: ['#fbbf24', '#f59e0b'], title: 'Wo begegnet dir Rhythmus im Alltag?', text: 'Herzschlag, Schritte, Scheibenwischer: Überall stecken Rhythmen. Hör genau hin!' },
    { name: 'Ausprobieren', color: ['#34d399', '#10b981'], title: 'Klatsch den Rhythmus nach', text: 'Hier kommt eine interaktive Station hin, zum Beispiel eine Klaviatur, eine Zuordnung oder ein Hörbeispiel.' },
    { name: 'Üben', color: ['#22d3ee', '#06b6d4'], title: 'Welche Note ist länger?', text: 'Hier kommt eine Übung mit sofortigem Feedback hin.' },
    { name: 'Abschluss', color: ['#e879f9', '#d946ef'], title: 'Das hast du gelernt', text: 'Eine kurze Zusammenfassung der wichtigsten Punkte.', merksatz: '💡 Ein Rhythmus ist eine Folge von langen und kurzen Tönen.' }
  ];
  var current = 0;

  function render() {
    var step = steps[current];
    var app = document.getElementById('app');
    app.style.setProperty('--accent', step.color[0]);
    app.style.setProperty('--accent-strong', step.color[1]);
    document.getElementById('pill').textContent = 'Schritt ' + (current + 1) + ' · ' + step.name;
    document.getElementById('title').textContent = step.title;

    var content = document.getElementById('content');
    content.innerHTML = '';
    var text = document.createElement('p');
    text.textContent = step.text;
    content.appendChild(text);
    if (step.merksatz) {
      var merksatz = document.createElement('div');
      merksatz.className = 'merksatz';
      merksatz.textContent = step.merksatz;
      content.appendChild(merksatz);
    }

    var dots = document.getElementById('dots');
    dots.innerHTML = '';
    steps.forEach(function (_, index) {
      var dot = document.createElement('button');
      dot.className = 'dot' + (index === current ? ' active' : '');
      dot.setAttribute('aria-label', 'Zu Schritt ' + (index + 1));
      dot.onclick = function () { current = index; render(); };
      dots.appendChild(dot);
    });
    document.getElementById('back').disabled = current === 0;
    document.getElementById('next').textContent = current === steps.length - 1 ? 'Fertig' : 'Weiter';
  }

  document.getElementById('back').onclick = function () { if (current > 0) { current--; render(); } };
  document.getElementById('next').onclick = function () { if (current < steps.length - 1) { current++; render(); } };
  render();
</script>
</body>
</html>`,
  },
  {
    id: 'quiz',
    title: 'Quiz-Baustein',
    summary: 'Multiple Choice mit sofortigem Feedback, Erklärung und Auswertung.',
    tags: ['Quiz', 'Feedback'],
    usage: 'Multiple-Choice-Quiz mit sofortigem, freundlichem Feedback, kurzer Erklärung je Frage und Auswertung mit Sternen am Ende.',
    html: `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quiz-Baustein</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #020617; color: #e2e8f0; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { width: min(680px, 100%); padding: 20px; border-radius: 16px; background: rgba(15, 23, 42, 0.9); border: 1px solid #1e293b; }
  .pill { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #e879f9; }
  h2 { margin: 2px 0 16px; font-size: clamp(18px, 3vw, 24px); color: #f8fafc; }
  .answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .answer { min-height: 48px; padding: 10px 14px; border-radius: 12px; text-align: left; font: inherit; color: #e2e8f0; background: rgba(2, 6, 23, 0.9); border: 1px solid #1e293b; cursor: pointer; }
  .answer.correct { border-color: #10b981; background: rgba(16, 185, 129, 0.15); }
  .answer.wrong { border-color: #f59e0b; background: rgba(245, 158, 11, 0.12); }
  .answer:disabled { cursor: default; }
  .feedback { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: #0f172a; border: 1px solid #1e293b; }
  .footer { display: flex; justify-content: flex-end; margin-top: 16px; }
  .next { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 12px; font: inherit; font-weight: 600; color: #0f172a; background: #d946ef; cursor: pointer; white-space: nowrap; }
  .stars { font-size: 34px; letter-spacing: 6px; }
</style>
</head>
<body>
<main class="card">
  <div class="pill" id="pill"></div>
  <h2 id="question"></h2>
  <div class="answers" id="answers"></div>
  <div class="feedback" id="feedback" hidden></div>
  <div class="footer"><button class="next" id="next" hidden>Weiter</button></div>
</main>
<script>
  // correct = Index der richtigen Antwort.
  var questions = [
    { question: 'Wie viele Schläge dauert eine halbe Note im 4/4-Takt?', answers: ['1 Schlag', '2 Schläge', '3 Schläge', '4 Schläge'], correct: 1, explanation: 'Eine halbe Note ist halb so lang wie eine ganze Note: 2 Schläge.' },
    { question: 'Was bedeutet „forte“?', answers: ['leise', 'schnell', 'laut', 'langsam'], correct: 2, explanation: 'forte (f) heißt laut, piano (p) heißt leise.' },
    { question: 'Welches Instrument ist ein Holzblasinstrument?', answers: ['Trompete', 'Querflöte', 'Posaune', 'Pauke'], correct: 1, explanation: 'Die Querflöte zählt zu den Holzblasinstrumenten, auch wenn sie meist aus Metall ist.' }
  ];
  var index = 0;
  var score = 0;

  function showQuestion() {
    var item = questions[index];
    document.getElementById('pill').textContent = 'Quiz · Frage ' + (index + 1) + ' von ' + questions.length;
    document.getElementById('question').textContent = item.question;
    document.getElementById('feedback').hidden = true;
    document.getElementById('next').hidden = true;
    var answers = document.getElementById('answers');
    answers.innerHTML = '';
    item.answers.forEach(function (text, answerIndex) {
      var button = document.createElement('button');
      button.className = 'answer';
      button.textContent = text;
      button.onclick = function () { choose(answerIndex); };
      answers.appendChild(button);
    });
  }

  function choose(answerIndex) {
    var item = questions[index];
    var buttons = document.querySelectorAll('.answer');
    buttons.forEach(function (button, buttonIndex) {
      button.disabled = true;
      if (buttonIndex === item.correct) button.classList.add('correct');
      else if (buttonIndex === answerIndex) button.classList.add('wrong');
    });
    var right = answerIndex === item.correct;
    if (right) score++;
    var feedback = document.getElementById('feedback');
    feedback.textContent = (right ? '✅ Richtig! ' : '💡 Noch nicht ganz. ') + item.explanation;
    feedback.hidden = false;
    var next = document.getElementById('next');
    next.textContent = index === questions.length - 1 ? 'Auswertung' : 'Weiter';
    next.hidden = false;
  }

  function showResult() {
    var stars = Math.round((score / questions.length) * 3);
    document.getElementById('pill').textContent = 'Quiz · Auswertung';
    document.getElementById('question').textContent = score + ' von ' + questions.length + ' richtig';
    document.getElementById('answers').innerHTML = '<div class="stars">' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</div>';
    var feedback = document.getElementById('feedback');
    feedback.textContent = stars === 3
      ? 'Super gemacht! 🌟'
      : stars > 0 ? 'Gut gemacht! Probier es gleich noch einmal.' : 'Kein Problem! Lies dir die Erklärungen an und probier es gleich noch einmal.';
    feedback.hidden = false;
    var next = document.getElementById('next');
    next.textContent = 'Nochmal';
    next.hidden = false;
  }

  document.getElementById('next').onclick = function () {
    if (index === questions.length) { index = 0; score = 0; showQuestion(); return; }
    index++;
    if (index === questions.length) showResult(); else showQuestion();
  };
  showQuestion();
</script>
</body>
</html>`,
  },
  {
    id: 'zuordnen',
    title: 'Zuordnen per Drag & Drop',
    summary: 'Begriffe auf Felder ziehen, funktioniert auch per Touch auf dem iPad.',
    tags: ['Drag & Drop', 'iPad'],
    usage: 'Zuordnungsaufgabe per Drag & Drop mit Pointer-Events (statt HTML5-Drag-and-Drop), damit sie auch per Finger auf dem iPad funktioniert. Mit Prüfen-Button und Feedback.',
    html: `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zuordnen per Drag &amp; Drop</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #020617; color: #e2e8f0; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { width: min(680px, 100%); padding: 20px; border-radius: 16px; background: rgba(15, 23, 42, 0.9); border: 1px solid #1e293b; }
  .pill { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #22d3ee; }
  h2 { margin: 2px 0 16px; font-size: clamp(18px, 3vw, 24px); color: #f8fafc; }
  .bank { display: flex; flex-wrap: wrap; gap: 10px; min-height: 60px; padding: 10px; border-radius: 12px; background: rgba(2, 6, 23, 0.9); border: 1px dashed #334155; }
  .chip { min-height: 44px; padding: 10px 14px; border-radius: 12px; font-weight: 600; color: #0f172a; background: #67e8f9; cursor: grab; touch-action: none; user-select: none; }
  .chip.dragging { position: relative; z-index: 10; cursor: grabbing; pointer-events: none; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4); }
  .slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 16px; }
  .slot { display: grid; gap: 8px; align-content: start; min-height: 104px; padding: 10px; border-radius: 12px; background: rgba(2, 6, 23, 0.9); border: 1px solid #1e293b; }
  .slot-label { font-size: 13px; font-weight: 600; color: #94a3b8; }
  .slot.over { border-color: #22d3ee; }
  .slot.correct { border-color: #10b981; }
  .slot.wrong { border-color: #f59e0b; }
  .footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 16px; }
  .check { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 12px; font: inherit; font-weight: 600; color: #0f172a; background: #06b6d4; cursor: pointer; white-space: nowrap; }
</style>
</head>
<body>
<main class="card">
  <div class="pill">Üben · Zuordnen</div>
  <h2>Wie lange klingt welche Note?</h2>
  <div class="bank" id="bank"></div>
  <div class="slots" id="slots"></div>
  <div class="footer"><span id="feedback">Ziehe jede Note auf die passende Dauer.</span><button class="check" id="check">Prüfen</button></div>
</main>
<script>
  var pairs = [
    { item: 'Ganze Note', target: '4 Schläge' },
    { item: 'Halbe Note', target: '2 Schläge' },
    { item: 'Viertelnote', target: '1 Schlag' },
    { item: 'Achtelnote', target: '½ Schlag' }
  ];
  var bank = document.getElementById('bank');
  var slots = document.getElementById('slots');

  pairs.slice().sort(function () { return Math.random() - 0.5; }).forEach(function (pair) {
    var chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = pair.item;
    chip.dataset.item = pair.item;
    chip.addEventListener('pointerdown', startDrag);
    bank.appendChild(chip);
  });
  pairs.forEach(function (pair) {
    var slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.answer = pair.item;
    slot.innerHTML = '<span class="slot-label"></span>';
    slot.firstChild.textContent = pair.target;
    slots.appendChild(slot);
  });

  // Pointer-Events statt HTML5-Drag-and-Drop: funktioniert mit Maus, Stift und Finger.
  var drag = null;
  function startDrag(event) {
    if (drag) return;
    var chip = event.currentTarget;
    drag = { chip: chip, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    chip.classList.add('dragging');
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }
  function moveDrag(event) {
    if (event.pointerId !== drag.pointerId) return;
    drag.chip.style.transform = 'translate(' + (event.clientX - drag.x) + 'px,' + (event.clientY - drag.y) + 'px)';
    highlight(slotAt(event));
  }
  function endDrag(event) {
    if (event.pointerId !== drag.pointerId) return;
    var chip = drag.chip;
    var slot = event.type === 'pointerup' ? slotAt(event) : null;
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    chip.classList.remove('dragging');
    chip.style.transform = '';
    highlight(null);
    if (slot) {
      var previous = slot.querySelector('.chip');
      if (previous && previous !== chip) bank.appendChild(previous);
      slot.appendChild(chip);
    } else {
      bank.appendChild(chip);
    }
    document.querySelectorAll('.slot').forEach(function (item) { item.classList.remove('correct', 'wrong'); });
    drag = null;
  }
  function slotAt(event) {
    var element = document.elementFromPoint(event.clientX, event.clientY);
    return element ? element.closest('.slot') : null;
  }
  function highlight(slot) {
    document.querySelectorAll('.slot').forEach(function (item) { item.classList.toggle('over', item === slot); });
  }

  document.getElementById('check').onclick = function () {
    var right = 0;
    document.querySelectorAll('.slot').forEach(function (slot) {
      var chip = slot.querySelector('.chip');
      var correct = chip && chip.dataset.item === slot.dataset.answer;
      slot.classList.toggle('correct', Boolean(correct));
      slot.classList.toggle('wrong', Boolean(chip) && !correct);
      if (correct) right++;
    });
    document.getElementById('feedback').textContent = right === pairs.length
      ? '✅ Alles richtig zugeordnet!'
      : '💡 ' + right + ' von ' + pairs.length + ' richtig. Die gelben Felder kannst du noch einmal ändern.';
  };
</script>
</body>
</html>`,
  },
  {
    id: 'klaviatur',
    title: 'Klaviatur',
    summary: 'Spielbare Oktave mit Klang, Mehrfingerbedienung und Notennamen.',
    tags: ['Klang', 'Werkzeug'],
    usage: 'Spielbare Klaviatur (eine Oktave, c1 bis c2) mit Klang über die Web Audio API, Mehrfingerbedienung per Pointer-Events und einblendbaren deutschen Notennamen (H statt B).',
    html: `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Klaviatur</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #020617; color: #e2e8f0; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { width: min(680px, 100%); padding: 20px; border-radius: 16px; background: rgba(15, 23, 42, 0.95); border: 1px solid #1e293b; }
  .pill { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #34d399; }
  h2 { margin: 2px 0 12px; font-size: clamp(18px, 3vw, 24px); color: #f8fafc; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
  .readout { font-weight: 600; color: #34d399; }
  label { display: flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; }
  .piano { position: relative; display: flex; height: 200px; user-select: none; touch-action: none; }
  .white { flex: 1; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px; margin: 0 2px; border-radius: 0 0 10px 10px; background: #f8fafc; color: #0f172a; font-weight: 700; }
  .black { position: absolute; top: 0; z-index: 2; width: 8%; height: 60%; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; border-radius: 0 0 8px 8px; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; font-size: 11px; }
  .key.active.white { background: #6ee7b7; }
  .key.active.black { background: #10b981; }
  .hide-names .key span { visibility: hidden; }
</style>
</head>
<body>
<main class="card">
  <div class="pill">Ausprobieren · Klaviatur</div>
  <h2>Spiel die Töne von c1 bis c2</h2>
  <div class="toolbar">
    <span class="readout" id="readout">Tippe auf eine Taste</span>
    <label><input type="checkbox" id="names" checked> Notennamen</label>
  </div>
  <div class="piano" id="piano"></div>
</main>
<script>
  // midi: 60 = c1. Deutsche Notennamen (H statt B).
  var whiteKeys = [{ name: 'c', midi: 60 }, { name: 'd', midi: 62 }, { name: 'e', midi: 64 }, { name: 'f', midi: 65 }, { name: 'g', midi: 67 }, { name: 'a', midi: 69 }, { name: 'h', midi: 71 }, { name: 'c', midi: 72 }];
  var blackKeys = [{ name: 'cis', midi: 61, after: 0 }, { name: 'dis', midi: 63, after: 1 }, { name: 'fis', midi: 66, after: 3 }, { name: 'gis', midi: 68, after: 4 }, { name: 'ais', midi: 70, after: 5 }];
  var piano = document.getElementById('piano');
  var audio = null;

  function context() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  function play(midi) {
    var ctx = context();
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 1.3);
  }
  function addKey(key, className) {
    var element = document.createElement('div');
    element.className = 'key ' + className;
    element.innerHTML = '<span></span>';
    element.firstChild.textContent = key.name;
    element.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      element.classList.add('active');
      play(key.midi);
      document.getElementById('readout').textContent = 'Gespielt: ' + key.name;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (type) {
      element.addEventListener(type, function () { element.classList.remove('active'); });
    });
    return element;
  }
  whiteKeys.forEach(function (key) { piano.appendChild(addKey(key, 'white')); });
  blackKeys.forEach(function (key) {
    var element = addKey(key, 'black');
    element.style.left = ((key.after + 1) * (100 / whiteKeys.length) - 4) + '%';
    piano.appendChild(element);
  });
  document.getElementById('names').onchange = function (event) {
    piano.classList.toggle('hide-names', !event.target.checked);
  };
</script>
</body>
</html>`,
  },
];
