/**
 * KKM 講師応募 → 自動整形 ＋ 公開用シート同期（Google Apps Script）
 * =====================================================================
 * 新・応募フォームに対応。選択式の回答はそのままコード化し、地域タイプ・
 * 学校歴・出身校は確定ロジックで判定。コメントのみAIで生成（失敗時は
 * 自己PR等でフォールバック）するため、AIキーが無くても動きます。
 *
 * 【個人情報】回答シートは非公開のまま。公開用シートには公開OK列だけ同期。
 * 【運営の手間】応募 → 自動整形 → 評価入力・公開TRUE → メニュー「公開用へ同期」
 *
 * ★導入は SETUP-tutors-sheet.md を参照。公開用シートIDは下の CONFIG に、
 *   （任意）コメント生成のAPIキーは スクリプトプロパティ GEMINI_API_KEY に。
 * =====================================================================
 */

var CONFIG = {
  PUBLIC_SPREADSHEET_ID: '',   // ← サイトが読む「公開用」スプレッドシートのID
  PUBLIC_SHEET_NAME: '公開用',
};

var GEMINI_MODEL = 'gemini-2.5-flash';

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

/* サイト（公開用シート）に出す列。tutors.html の読み取り列と一致させる。
   ★評価（認定の点数）は非公開：公開用シートにもサイトにも出さない。
   　認定4.0以上の絞り込みは syncPublic 側で実施済み。 */
var PUBLIC_HEADERS = [
  '公開', 'ニックネーム', '学部学年', '対応サービス', '希望時給', '指導志望学年', '指導科目',
  '都道府県', '出身校', '部活・習い事', '受験経験', '自己PR', '目指す姿', 'コメント',
  '出身地', 'きょうだい', '幼少期', '学校歴',
  '学習スタイル', '得意不得意', '関わり方', 'コミュニケーション', 'やる気スイッチ'
];

/* 都市部とみなす都道府県（地域タイプ判定用） */
var URBAN_PREF = ['東京都', '神奈川県', '大阪府', '愛知県', '埼玉県', '千葉県', '兵庫県', '京都府', '福岡県'];

/* ------- メニュー ------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('KKM')
    .addItem('選択行をAI分類', 'classifySelectedRows')
    .addItem('未処理の行をまとめてAI分類', 'classifyUnprocessedRows')
    .addSeparator()
    .addItem('公開用シートへ同期', 'syncPublic')
    .addToUi();
}

/* UIが使えない実行文脈（エディタの実行ボタン等）でも落ちない通知 */
function notify(msg) {
  try { SpreadsheetApp.getUi().alert(msg); }
  catch (e) {
    try { SpreadsheetApp.getActiveSpreadsheet().toast(msg); } catch (e2) { Logger.log(msg); }
  }
}

function installTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitAI') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmitAI').forSpreadsheet(ss).onFormSubmit().create();
  notify('自動分類トリガーを設置しました。');
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
    classifyRow(sheet, r); n++; Utilities.sleep(200);
  }
  notify(n + ' 行を整形しました。');
}

function classifyUnprocessedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var headers = getHeaders(sheet);
  var doneCol = headers.indexOf('AI処理日時');
  var last = sheet.getLastRow(), n = 0;
  for (var r = 2; r <= last; r++) {
    if (doneCol >= 0 && sheet.getRange(r, doneCol + 1).getValue()) continue;
    classifyRow(sheet, r); n++; Utilities.sleep(300);
  }
  notify(n + ' 行を整形しました。');
}

/* ------- 1行を整形して書き込む ------- */
function classifyRow(sheet, row) {
  var headers = getHeaders(sheet);
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];

  // フォーム回答をキーワードで取得（自分の出力列・管理列は除外）
  function getForm(kw) {
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      if (!h || NON_FORM.indexOf(h) >= 0) continue;
      if (h === kw || h.indexOf(kw) >= 0) return values[j];
    }
    return '';
  }
  // フォームと出力で同名の列（指導志望学年）用：最初の列＝フォーム側を読む
  function firstVal(name) { var i = headers.indexOf(name); return i >= 0 ? values[i] : ''; }
  // 出力列＝右側（最後の同名列）に書き込む
  function put(h, v) { var c = headers.lastIndexOf(h); if (c >= 0) sheet.getRange(row, c + 1).setValue(v); }
  function has(v, s) { return String(v == null ? '' : v).indexOf(s) >= 0; }

  // ---- 選択式 → コード ----
  var sb = getForm('兄弟構成');
  put('きょうだい', has(sb,'長子')?'first':has(sb,'中間')?'middle':has(sb,'末')?'last':has(sb,'一人')?'only':'');

  var ch = getForm('幼少期の過ごし方');
  put('幼少期', (has(ch,'習い事')||has(ch,'多忙')||has(ch,'塾'))?'lessons':(has(ch,'のびのび')||has(ch,'自由'))?'free':'');

  var ssty = getForm('中高時代の勉強');
  put('学習スタイル', has(ssty,'独学')?'self':(has(ssty,'塾')||has(ssty,'活用')||has(ssty,'先生'))?'cram':'');

  var ap = getForm('勉強について');
  put('得意不得意', has(ap,'克服')?'effort':has(ap,'好き')?'inquiry':'');

  var st = getForm('指導スタイル');
  put('関わり方', has(st,'両方')?'companion, leader':has(st,'伴走')?'companion':has(st,'牽引')?'leader':'');

  var cm = getForm('コミュニケーションスタイル');
  put('コミュニケーション', (has(cm,'共感')||has(cm,'ほめ'))?'empathy':(has(cm,'論理')||has(cm,'的確'))?'logical':'');

  var mv = getForm('やる気にさせる'); var mo = [];
  if (has(mv,'競争')||has(mv,'達成')) mo.push('competition');
  if (has(mv,'好奇心')||has(mv,'面白')) mo.push('curiosity');
  if (has(mv,'安心')||has(mv,'安全')||has(mv,'焦')) mo.push('safety');
  put('やる気スイッチ', mo.join(', '));

  // ---- 対応サービス（複数選択） ----
  var sv = getForm('興味があるのはどれ') || getForm('2つのサービス');
  var svc = [];
  if (has(sv,'家庭教師')) svc.push('tutor');
  if (has(sv,'相談')) svc.push('consult');
  put('対応サービス', svc.join(', '));

  // ---- 転記 ----
  var faculty = String(getForm('学部') || '').trim();
  var grade = String(getForm('学年') || '').trim();
  put('学部学年', ('神戸大 ' + faculty + ' ' + grade).replace(/\s+/g, ' ').trim());
  put('ニックネーム', getForm('ニックネーム'));
  put('希望時給', getForm('希望時給'));
  put('指導志望学年', firstVal('指導志望学年')); // フォーム側(左)を読み、出力(右)へ
  put('指導科目', getForm('指導可能'));
  var pref = String(getForm('都道府県') || '').trim();
  put('都道府県', pref);
  put('部活・習い事', getForm('部活・習い事'));
  put('受験経験', getForm('推薦・浪人・編入'));
  var selfPR = getForm('自己PR');
  put('自己PR', selfPR);
  var goal = getForm('めざしたい');
  put('目指す姿', goal);

  // ---- 地域タイプ（都道府県＋引っ越し回数） ----
  var moves = String(getForm('引っ越し') || '');
  var origin = has(moves,'3') ? 'transfer' : (URBAN_PREF.indexOf(pref) >= 0 ? 'city' : (pref ? 'local' : ''));
  put('出身地', origin);

  // ---- 学校歴・出身校（公私のみ） ----
  var sch = String(getForm('出身中学名') || getForm('高校名') || '');
  var school = '', schoolType = '';
  if (has(sch,'私立') || has(sch,'一貫')) { school = 'jhs'; schoolType = '私立中高一貫'; }
  else if (has(sch,'国立')) { school = 'jhs'; schoolType = '国立'; }
  else if (has(sch,'公立')||has(sch,'県立')||has(sch,'市立')||has(sch,'町立')||has(sch,'区立')||has(sch,'都立')||has(sch,'府立')||has(sch,'道立')||has(sch,'村立')) {
    school = 'public'; schoolType = '公立中・公立高';
  }
  put('学校歴', school);
  put('出身校', schoolType);

  // ---- コメント（AI／失敗時は自己PR・目指す姿でフォールバック） ----
  var comment = callAIComment(getForm('性格'), selfPR, goal);
  if (!comment) comment = String(selfPR || goal || '').slice(0, 80);
  put('コメント', comment);

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
  if (!CONFIG.PUBLIC_SPREADSHEET_ID) { notify('CONFIG.PUBLIC_SPREADSHEET_ID を設定してください。'); return; }
  var src = SpreadsheetApp.getActiveSheet();
  var headers = getHeaders(src);
  var last = src.getLastRow();
  if (last < 2) { notify('データがありません。'); return; }
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
  notify((out.length - 1) + ' 名を公開用シートへ同期しました。');
}

function isPublic(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return ['true', '1', '公開', '○', 'yes', 'y', 'on'].indexOf(s) >= 0;
}

/* =====================================================================
   コメント生成（Google Gemini）。キーが無い/失敗した場合は '' を返す。
   ===================================================================== */
function callAIComment(seikaku, selfPR, goal) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return '';
  var prompt =
    'あなたは家庭教師紹介サービスKKMの運営アシスタントです。\n' +
    '神戸大生のプロフィール用に、保護者へ魅力が伝わる語り口調の紹介コメントを1文だけ作ってください。\n' +
    '60字以内。氏名・学校名は書かない。出力はコメント本文のみ（説明や記号は不要）。\n\n' +
    '性格：' + seikaku + '\n自己PR：' + selfPR + '\n目指す像：' + goal;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  var payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } };
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) { Logger.log('AIエラー ' + res.getResponseCode() + '：' + res.getContentText()); return ''; }
    var data = JSON.parse(res.getContentText());
    var text = data.candidates &&
               data.candidates[0].content.parts.map(function (p) { return p.text; }).join('');
    return String(text || '').replace(/^["「\s]+|["」\s]+$/g, '').trim();
  } catch (e) { Logger.log('AI例外：' + e); return ''; }
}
