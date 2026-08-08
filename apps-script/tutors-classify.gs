/**
 * KKM 講師応募 → AI補助分類 ＋ 公開用シート同期（Google Apps Script）
 * =====================================================================
 * 新・応募フォームに対応。選択式の回答はそのままコード化し、AIは
 * 「出身地の地域タイプ・受験ルート・紹介コメント」だけを補助的に判定します。
 *
 * 【個人情報】回答シートは非公開のまま。公開用シートには公開OK列だけ同期。
 * 【運営の手間】応募 → 自動分類 → 評価入力・公開TRUE → メニュー「公開用へ同期」
 * 【AI】Google Gemini（無料枠）。末尾 callAI() を差し替えれば他社AIも可。
 *
 * ★導入は SETUP-tutors-sheet.md を参照。APIキーは スクリプトプロパティ
 *   GEMINI_API_KEY に、公開用シートIDは下の CONFIG に設定してください。
 * =====================================================================
 */

var CONFIG = {
  PUBLIC_SPREADSHEET_ID: '',   // ← サイトが読む「公開用」スプレッドシートのID
  PUBLIC_SHEET_NAME: '公開用',
};

var GEMINI_MODEL = 'gemini-2.5-flash'; // 429/limit:0が出る場合はモデル変更 or 個人Gmailのキー

/* スクリプトが書き込む「正規化後」の列（回答シートの右側に用意しておく） */
var OUTPUT_HEADERS = [
  'ニックネーム', '学部学年', '対応サービス', '希望時給', '指導志望学年', '指導科目',
  '都道府県', '出身校', '部活・習い事', '受験経験', '自己PR', '目指す姿', 'コメント',
  '出身地', 'きょうだい', '幼少期', '学校歴',
  '学習スタイル', '得意不得意', '関わり方', 'コミュニケーション', 'やる気スイッチ',
  'AI処理日時'
];

/* フォーム読み取りの対象外（管理列 ＋ 出力列） */
var ADMIN_HEADERS = ['タイムスタンプ', 'メールアドレス', '氏名', '学生証の提示', '評価', '公開'];
var NON_FORM = OUTPUT_HEADERS.concat(ADMIN_HEADERS);

/* サイト（公開用シート）に出す列。tutors.html の読み取り列と一致させる */
var PUBLIC_HEADERS = [
  '公開', 'ニックネーム', '学部学年', '評価', '対応サービス', '希望時給', '指導志望学年', '指導科目',
  '都道府県', '出身校', '部活・習い事', '受験経験', '自己PR', '目指す姿', 'コメント',
  '出身地', 'きょうだい', '幼少期', '学校歴',
  '学習スタイル', '得意不得意', '関わり方', 'コミュニケーション', 'やる気スイッチ'
];

/* ------- メニュー ------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('KKM')
    .addItem('選択行をAI分類', 'classifySelectedRows')
    .addItem('未処理の行をまとめてAI分類', 'classifyUnprocessedRows')
    .addSeparator()
    .addItem('公開用シートへ同期', 'syncPublic')
    .addToUi();
}

function installTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitAI') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmitAI').forSpreadsheet(ss).onFormSubmit().create();
  SpreadsheetApp.getUi().alert('自動分類トリガーを設置しました。');
}

function onFormSubmitAI(e) {
  var sheet = e && e.range ? e.range.getSheet() : SpreadsheetApp.getActiveSheet();
  var row = e && e.range ? e.range.getRow() : sheet.getLastRow();
  classifyRow(sheet, row);
}

function classifySelectedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var rng = sheet.getActiveRange();
  var start = rng.getRow(), end = start + rng.getNumRows() - 1, n = 0;
  for (var r = start; r <= end; r++) {
    if (r === 1) continue;
    classifyRow(sheet, r); n++; Utilities.sleep(300);
  }
  SpreadsheetApp.getUi().alert(n + ' 行を分類しました。');
}

function classifyUnprocessedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var headers = getHeaders(sheet);
  var doneCol = headers.indexOf('AI処理日時');
  var last = sheet.getLastRow(), n = 0;
  for (var r = 2; r <= last; r++) {
    if (doneCol >= 0 && sheet.getRange(r, doneCol + 1).getValue()) continue;
    classifyRow(sheet, r); n++; Utilities.sleep(400);
  }
  SpreadsheetApp.getUi().alert(n + ' 行を分類しました。');
}

/* ------- 1行を分類して書き込む ------- */
function classifyRow(sheet, row) {
  var headers = getHeaders(sheet);
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];

  // フォームの回答を、見出しのキーワードで取得（管理列・出力列は除外）
  function getForm(kw) {
    var i = headers.indexOf(kw);
    if (i >= 0 && NON_FORM.indexOf(kw) < 0) return values[i];
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      if (!h || NON_FORM.indexOf(h) >= 0) continue;
      if (h.indexOf(kw) >= 0) return values[j];
    }
    return '';
  }
  function put(h, v) { var c = headers.indexOf(h); if (c >= 0) sheet.getRange(row, c + 1).setValue(v); }
  function has(v, s) { return String(v == null ? '' : v).indexOf(s) >= 0; }

  // ---- 選択式 → コードに直接マッピング ----
  var sb = getForm('兄弟構成');
  put('きょうだい', has(sb,'長子')?'first':has(sb,'中間')?'middle':has(sb,'末')?'last':has(sb,'一人')?'only':'');

  var ch = getForm('幼少期');
  put('幼少期', (has(ch,'習い事')||has(ch,'塾')||has(ch,'多忙'))?'lessons':(has(ch,'のびのび')||has(ch,'自由'))?'free':'');

  var ssty = getForm('勉強スタイル');
  put('学習スタイル', has(ssty,'独学')?'self':(has(ssty,'塾')||has(ssty,'活用')||has(ssty,'先生'))?'cram':'');

  var ap = getForm('勉強について');
  put('得意不得意', has(ap,'克服')?'effort':has(ap,'好き')?'inquiry':'');

  var st = getForm('指導スタイル');
  put('関わり方', has(st,'両方')?'companion, leader':has(st,'伴走')?'companion':has(st,'牽引')?'leader':'');

  var cm = getForm('コミュニケーション');
  put('コミュニケーション', (has(cm,'共感')||has(cm,'ほめ'))?'empathy':(has(cm,'論理')||has(cm,'的確'))?'logical':'');

  var mv = getForm('やる気'); var mo = [];
  if (has(mv,'競争')||has(mv,'達成')) mo.push('competition');
  if (has(mv,'好奇心')||has(mv,'面白')) mo.push('curiosity');
  if (has(mv,'安心')||has(mv,'安全')||has(mv,'焦')) mo.push('safety');
  put('やる気スイッチ', mo.join(', '));

  // ---- 対応サービス（複数選択）→ tutor / consult ----
  var sv = getForm('興味があるのはどれ') || getForm('2つのサービス') || getForm('サービス');
  var svc = [];
  if (has(sv,'家庭教師')) svc.push('tutor');
  if (has(sv,'相談')) svc.push('consult');
  put('対応サービス', svc.join(', '));

  // ---- そのまま公開する項目（フォーム回答を転記） ----
  var faculty = String(getForm('学部') || '').trim();
  var grade = String(getForm('学年') || '').trim();
  put('学部学年', ('神戸大 ' + faculty + ' ' + grade).replace(/\s+/g, ' ').trim());
  put('ニックネーム', getForm('ニックネーム'));
  put('希望時給', getForm('希望時給'));
  put('指導志望学年', getForm('指導志望'));
  put('指導科目', getForm('指導可能'));
  put('都道府県', getForm('出身地'));
  put('部活・習い事', getForm('部活'));
  put('受験経験', getForm('推薦') || getForm('編入') || getForm('浪人'));
  put('自己PR', getForm('自己PR'));
  put('目指す姿', getForm('めざしたい') || getForm('家庭教師をめざ'));

  // ---- AIで補助判定：地域タイプ・学校歴・出身校表示・コメント ----
  var aiInput =
    '出身地：' + getForm('出身地') + '\n' +
    '引っ越し回数：' + getForm('引っ越し') + '\n' +
    '出身中学・高校：' + (getForm('出身中学') || getForm('高校名')) + '\n' +
    '大学の入試種別：' + getForm('入試種別') + '\n' +
    '推薦・浪人・編入：' + (getForm('推薦') || getForm('編入')) + '\n' +
    '性格：' + getForm('性格') + '\n' +
    '得意な教え方：' + getForm('得意な教え方') + '\n' +
    '自己PR：' + getForm('自己PR') + '\n' +
    '目指す家庭教師像：' + (getForm('めざしたい') || getForm('家庭教師をめざ'));

  var ai = callAI(aiInput) || {};
  put('出身地', ai.origin || '');
  put('学校歴', Array.isArray(ai.school) ? ai.school.join(', ') : (ai.school || ''));
  put('出身校', ai.schoolType || '');
  if (ai.comment) put('コメント', ai.comment);

  put('AI処理日時', new Date());
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

/* =====================================================================
   公開用スプレッドシートへ同期（評価4.0以上 かつ 公開=TRUE の行だけ）
   ===================================================================== */
function syncPublic() {
  var ui = SpreadsheetApp.getUi();
  if (!CONFIG.PUBLIC_SPREADSHEET_ID) { ui.alert('CONFIG.PUBLIC_SPREADSHEET_ID を設定してください。'); return; }
  var src = SpreadsheetApp.getActiveSheet();
  var headers = getHeaders(src);
  var last = src.getLastRow();
  if (last < 2) { ui.alert('データがありません。'); return; }
  var data = src.getRange(1, 1, last, headers.length).getValues();
  function col(h) { return headers.indexOf(h); }

  var out = [PUBLIC_HEADERS.slice()];
  for (var r = 1; r < last; r++) {
    var rowv = data[r];
    var rating = parseFloat(rowv[col('評価')]) || 0;
    if (!isPublic(rowv[col('公開')]) || rating < 4.0) continue;
    out.push(PUBLIC_HEADERS.map(function (h) {
      if (h === '公開') return 'TRUE';
      var c = col(h); return c >= 0 ? rowv[c] : '';
    }));
  }

  var dest = SpreadsheetApp.openById(CONFIG.PUBLIC_SPREADSHEET_ID);
  var sh = dest.getSheetByName(CONFIG.PUBLIC_SHEET_NAME) || dest.insertSheet(CONFIG.PUBLIC_SHEET_NAME);
  sh.clearContents();
  sh.getRange(1, 1, out.length, PUBLIC_HEADERS.length).setValues(out);
  ui.alert((out.length - 1) + ' 名を公開用シートへ同期しました。');
}

function isPublic(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return ['true', '1', '公開', '○', 'yes', 'y', 'on'].indexOf(s) >= 0;
}

/* =====================================================================
   AI呼び出し（Google Gemini）。他社AIに変える場合はここだけ差し替え。
   出力：origin / school[] / schoolType / comment
   ===================================================================== */
function callAI(profileText) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です。');

  var prompt =
    'あなたは家庭教師紹介サービスKKMの運営アシスタントです。\n' +
    '神戸大生の応募情報を読み、指定スキーマのJSONだけを出力してください。\n' +
    '判断材料がない項目は空文字""（配列は[]）にしてください。実名や学校名は出力に含めないでください。\n\n' +
    '# 応募情報\n' + profileText + '\n\n' +
    '# 出力スキーマ（このキー構成のJSONのみ）\n' +
    '{\n' +
    '  "origin": "local | city | transfer のいずれか、または空",\n' +
    '  "school": ["public | jhs | hs から該当（複数可）"],\n' +
    '  "schoolType": "出身校の公私のみを短く。学校名は書かない。例: 公立中・公立高 / 私立中高一貫",\n' +
    '  "comment": "本人の魅力が伝わる語り口調の一言（60字以内・氏名/学校名なし）"\n' +
    '}\n\n' +
    '# コードの意味\n' +
    'origin: local=地方出身 / city=都市部出身 / transfer=転勤・引っ越しが多い（都道府県と引っ越し回数から判断）\n' +
    'school: public=公立中心 / jhs=中学受験経験あり（私立中・中高一貫）/ hs=高校受験経験あり\n';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('AIエラー ' + res.getResponseCode() + '：' + res.getContentText());
    return null;
  }
  var data = JSON.parse(res.getContentText());
  var text = data.candidates &&
             data.candidates[0].content.parts.map(function (p) { return p.text; }).join('');
  if (!text) return null;
  try { return JSON.parse(text); }
  catch (err) {
    var s = text.indexOf('{'), e = text.lastIndexOf('}');
    return (s >= 0 && e > s) ? JSON.parse(text.substring(s, e + 1)) : null;
  }
}
