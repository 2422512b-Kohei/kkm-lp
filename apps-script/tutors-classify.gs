/**
 * KKM 講師応募 → AI自動分類スクリプト（Google Apps Script）
 * =====================================================================
 * 応募フォームの自由記述（受験経験・育った環境・性格など）をAIが読み取り、
 * tutors.html が使うタグ列（出身地・きょうだい…）へ自動で振り分けます。
 *
 * ・評価 … 運営が後から手入力（AIは触りません）
 * ・公開 … 運営が承認時に TRUE にする（AIは触りません）
 *   → 評価4.0以上 かつ 公開=TRUE になるまで、応募者はサイトに出ません。
 *
 * 使うAI：Google Gemini（無料枠あり）。※末尾のcallAI()を差し替えれば他社AIも可。
 *
 * ------- 導入手順（初回だけ）-------
 * 1. 応募フォームの回答スプレッドシートを開く
 * 2. 拡張機能 → Apps Script を開き、このファイルの内容を貼り付けて保存
 * 3. Google AI Studio (aistudio.google.com/app/apikey) でAPIキーを発行
 * 4. Apps Script左の「プロジェクトの設定 → スクリプト プロパティ」に
 *      プロパティ名: GEMINI_API_KEY   値: 発行したキー
 * 5. エディタ上部の関数選択で installTrigger を選び「実行」（権限を許可）
 *      → 以後、フォーム送信のたびに自動でAI分類されます
 * 6. 既存の回答も分類したい時は、シートで対象行を選択して
 *      メニュー「KKM → 選択行をAI分類」を実行
 * =====================================================================
 */

/* このスクリプトが「書き込む」列（＝AIの出力先）。tutors.html の列名と一致させること。 */
var OUTPUT_HEADERS = [
  'ニックネーム', '学部学年', '指導科目', 'コメント',
  '出身地', 'きょうだい', '幼少期', '学校歴',
  '学習スタイル', '得意不得意', '関わり方', 'コミュニケーション', 'やる気スイッチ',
  'AI処理日時'
];

/* AIの入力から除外する列（運営列 ＋ 出力列自身）。これ以外の全回答をAIに渡す。 */
var EXCLUDE_FROM_INPUT = OUTPUT_HEADERS.concat(['評価', '公開']);

var GEMINI_MODEL = 'gemini-2.0-flash'; // 変更可（例: gemini-2.5-flash）

/* ------- メニュー ------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KKM')
    .addItem('選択行をAI分類', 'classifySelectedRows')
    .addItem('未処理の行をまとめてAI分類', 'classifyUnprocessedRows')
    .addToUi();
}

/* ------- フォーム送信トリガーの設置（1回だけ実行） ------- */
function installTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 二重登録を防ぐ
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitAI') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmitAI').forSpreadsheet(ss).onFormSubmit().create();
  SpreadsheetApp.getUi().alert('自動分類トリガーを設置しました。以後、フォーム送信ごとに分類します。');
}

/* ------- フォーム送信時に自動実行 ------- */
function onFormSubmitAI(e) {
  var sheet = e && e.range ? e.range.getSheet() : SpreadsheetApp.getActiveSheet();
  var row = e && e.range ? e.range.getRow() : sheet.getLastRow();
  classifyRow(sheet, row);
}

/* ------- 選択行を分類 ------- */
function classifySelectedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var rng = sheet.getActiveRange();
  var start = rng.getRow(), end = start + rng.getNumRows() - 1;
  var n = 0;
  for (var r = start; r <= end; r++) {
    if (r === 1) continue; // ヘッダー行はスキップ
    classifyRow(sheet, r); n++;
  }
  SpreadsheetApp.getUi().alert(n + ' 行をAI分類しました。');
}

/* ------- 未処理（AI処理日時が空）の行をまとめて分類 ------- */
function classifyUnprocessedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var headers = getHeaders(sheet);
  var doneCol = headers.indexOf('AI処理日時');
  var last = sheet.getLastRow();
  var n = 0;
  for (var r = 2; r <= last; r++) {
    var done = doneCol >= 0 ? sheet.getRange(r, doneCol + 1).getValue() : '';
    if (done) continue;
    classifyRow(sheet, r); n++;
    Utilities.sleep(400); // レート制限に配慮
  }
  SpreadsheetApp.getUi().alert(n + ' 行をAI分類しました。');
}

/* ------- 1行を分類して書き込む ------- */
function classifyRow(sheet, row) {
  var headers = getHeaders(sheet);
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];

  // 応募者の回答テキスト（除外列以外の「見出し: 回答」を連結）
  var lines = [];
  headers.forEach(function (h, i) {
    if (!h || EXCLUDE_FROM_INPUT.indexOf(h) >= 0) return;
    var v = values[i];
    if (v !== '' && v !== null && v !== undefined) lines.push(h + '：' + v);
  });
  if (!lines.length) return;

  var result = callAI(lines.join('\n'));
  if (!result) return;

  // 既存値を消さないよう、空セルのみ埋める設定にしたい場合は overwrite=false に
  var overwrite = true;
  function put(header, val) {
    var c = headers.indexOf(header);
    if (c < 0) return;
    var cell = sheet.getRange(row, c + 1);
    if (!overwrite && cell.getValue() !== '') return;
    cell.setValue(val);
  }
  var arr = function (x) { return Array.isArray(x) ? x.join(', ') : (x || ''); };

  put('ニックネーム', result.nickname);
  put('学部学年', result.major);
  put('指導科目', result.subjects);
  put('コメント', result.comment);
  put('出身地', result.origin);
  put('きょうだい', result.sibling);
  put('幼少期', result.childhood);
  put('学校歴', arr(result.school));
  put('学習スタイル', result.studystyle);
  put('得意不得意', result.aptitude);
  put('関わり方', result.stance);
  put('コミュニケーション', result.comm);
  put('やる気スイッチ', arr(result.motivation));
  put('AI処理日時', new Date());
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

/* =====================================================================
   AI呼び出し（Google Gemini）
   他社AIに変える場合は、この関数だけ差し替えればOK。
   ===================================================================== */
function callAI(profileText) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です。');

  var prompt =
    'あなたは家庭教師紹介サービスKKMの運営アシスタントです。\n' +
    '神戸大生の応募フォーム回答を読み、指定スキーマのJSONだけを出力してください。\n' +
    '憶測で埋めず、判断材料がない項目は空文字""（配列項目は空配列[]）にしてください。\n' +
    '出力に応募者の実名（姓名）は含めないでください。\n\n' +
    '# 応募者の回答\n' + profileText + '\n\n' +
    '# 出力スキーマ（このキー構成のJSONのみ・説明文やコードブロックは不要）\n' +
    '{\n' +
    '  "nickname": "公開用の呼び名。実名は使わず、親しみやすい呼び名＋「先輩」。例: たく先輩",\n' +
    '  "major": "所属。例: 神戸大 工学部 2年。不明なら空",\n' +
    '  "subjects": "指導できる科目。例: 数学・理科",\n' +
    '  "comment": "本人の魅力が伝わる語り口調の一言（60字以内・実名なし）",\n' +
    '  "origin": "local | city | transfer のいずれか、または空",\n' +
    '  "sibling": "first | middle | last | only のいずれか、または空",\n' +
    '  "childhood": "lessons | free のいずれか、または空",\n' +
    '  "school": ["public | jhs | hs から該当するもの（複数可）"],\n' +
    '  "studystyle": "self | cram のいずれか、または空",\n' +
    '  "aptitude": "effort | inquiry のいずれか、または空",\n' +
    '  "stance": "companion | leader のいずれか、または空",\n' +
    '  "comm": "empathy | logical のいずれか、または空",\n' +
    '  "motivation": ["competition | curiosity | safety から該当するもの（複数可）"]\n' +
    '}\n\n' +
    '# コードの意味\n' +
    'origin: local=地方出身 / city=都市部出身 / transfer=転勤族・引っ越し経験あり\n' +
    'sibling: first=長子 / middle=中間子 / last=末っ子 / only=一人っ子\n' +
    'childhood: lessons=習い事多め派 / free=のびのび自由派\n' +
    'school: public=公立中心 / jhs=中学受験経験あり / hs=高校受験経験あり\n' +
    'studystyle: self=独学・工夫型 / cram=塾・予備校活用型\n' +
    'aptitude: effort=努力型（苦労して克服）/ inquiry=探求型（昔から勉強好き）\n' +
    'stance: companion=伴走型（斜めの関係）/ leader=牽引型（頼れる指導者）\n' +
    'comm: empathy=じっくり共感・ほめて伸ばす / logical=論理的・的確に課題解決\n' +
    'motivation: competition=競争・達成感 / curiosity=好奇心・面白さ / safety=心理的安全性・安心感\n';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    Logger.log('AIエラー ' + code + '：' + res.getContentText());
    return null;
  }
  var data = JSON.parse(res.getContentText());
  var text = data.candidates &&
             data.candidates[0].content.parts.map(function (p) { return p.text; }).join('');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    // 念のため、最初の { から最後の } までを抜き出して再パース
    var s = text.indexOf('{'), e = text.lastIndexOf('}');
    return (s >= 0 && e > s) ? JSON.parse(text.substring(s, e + 1)) : null;
  }
}
