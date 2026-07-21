/**
 * KKM 講師応募 → AI自動分類 ＋ 公開用シート同期（Google Apps Script）
 * =====================================================================
 * 応募フォームの自由記述（性格・勉強スタイル・自己PRなど）をAIが読み取り、
 * tutors.html が使うタグ列へ自動で振り分けます。
 *
 * 【個人情報の扱い（重要）】
 *  ・回答シート（このスクリプトを置くシート）は「非公開」のまま運用します。
 *    氏名・メール・学生証などはこのシートだけに残します。
 *  ・サイトが読むのは、公開OKな項目だけを写した「公開用スプレッドシート」です。
 *    syncPublic() で、評価4.0以上かつ公開=TRUE の行だけを同期します。
 *
 * 【運営の手間】応募が来る → AIがタグを自動記入 → 評価を手入力・公開をTRUE
 *              → メニュー「KKM → 公開用シートへ同期」
 *
 * 使うAI：Google Gemini（無料枠あり）。末尾 callAI() を差し替えれば他社AIも可。
 *
 * ------- 導入手順（初回だけ）-------
 * 1. フォームの回答スプレッドシートを開く（＝このシート／非公開のまま）
 * 2. 右側の空き列に、下記 OUTPUT_HEADERS ＋「評価」「公開」の見出しを追加
 * 3. 別に「公開用」スプレッドシートを新規作成し、そのIDを CONFIG に貼る
 *    （この公開用だけを「リンクを知っている全員＝閲覧者」に共有する）
 * 4. 拡張機能 → Apps Script にこのコードを貼り付けて保存
 * 5. Google AI Studio (aistudio.google.com/app/apikey) でAPIキーを発行し、
 *    「プロジェクトの設定 → スクリプト プロパティ」に GEMINI_API_KEY として登録
 * 6. 関数 installTrigger を1回実行（権限を許可）→ 以後フォーム送信で自動分類
 * 7. tutors.html の CONFIG.SHEET_ID に「公開用」スプレッドシートのIDを貼る
 * =====================================================================
 */

var CONFIG = {
  PUBLIC_SPREADSHEET_ID: '',   // ← サイトが読む「公開用」スプレッドシートのID
  PUBLIC_SHEET_NAME: '公開用',
};

var GEMINI_MODEL = 'gemini-2.5-flash'; // 変更可。429/limit:0が出る場合はモデル変更 or 個人Gmailのキーを使う

/* AIが書き込む列（回答シートの右側に見出しを用意しておく） */
var OUTPUT_HEADERS = [
  'ニックネーム', '学部学年', '指導科目', 'コメント',
  '出身地', 'きょうだい', '幼少期', '学校歴',
  '学習スタイル', '得意不得意', '関わり方', 'コミュニケーション', 'やる気スイッチ',
  'AI処理日時'
];

/* AIに渡さない列（個人情報・管理列・AIの出力列自身） */
var EXCLUDE_FROM_INPUT = OUTPUT_HEADERS.concat([
  'タイムスタンプ', 'メールアドレス', '氏名', '学生証の提示', '評価', '公開'
]);

/* サイト（公開用シート）に出す列。tutors.html の読み取り列と一致させる */
var PUBLIC_HEADERS = [
  '公開', 'ニックネーム', '学部学年', '評価', '対応サービス', '指導科目', 'コメント',
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

/* ------- フォーム送信トリガー設置（1回だけ） ------- */
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

/* ------- 選択行を分類 ------- */
function classifySelectedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var rng = sheet.getActiveRange();
  var start = rng.getRow(), end = start + rng.getNumRows() - 1, n = 0;
  for (var r = start; r <= end; r++) {
    if (r === 1) continue;
    classifyRow(sheet, r); n++; Utilities.sleep(300);
  }
  SpreadsheetApp.getUi().alert(n + ' 行をAI分類しました。');
}

/* ------- 未処理（AI処理日時が空）を一括 ------- */
function classifyUnprocessedRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var headers = getHeaders(sheet);
  var doneCol = headers.indexOf('AI処理日時');
  var last = sheet.getLastRow(), n = 0;
  for (var r = 2; r <= last; r++) {
    if (doneCol >= 0 && sheet.getRange(r, doneCol + 1).getValue()) continue;
    classifyRow(sheet, r); n++; Utilities.sleep(400);
  }
  SpreadsheetApp.getUi().alert(n + ' 行をAI分類しました。');
}

/* ------- 1行を分類して書き込む ------- */
function classifyRow(sheet, row) {
  var headers = getHeaders(sheet);
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  function getVal(h) { var i = headers.indexOf(h); return i >= 0 ? values[i] : ''; }
  function put(h, v) { var c = headers.indexOf(h); if (c >= 0) sheet.getRange(row, c + 1).setValue(v); }

  // 応募者の回答（除外列以外の「見出し：回答」を連結）
  var lines = [];
  headers.forEach(function (h, i) {
    if (!h || EXCLUDE_FROM_INPUT.indexOf(h) >= 0) return;
    var v = values[i];
    if (v !== '' && v !== null && v !== undefined) lines.push(h + '：' + v);
  });
  // ニックネーム用に、下の名前だけAIに渡す（フルネームは渡さない）
  var namePart = firstNameHint(getVal('氏名'));
  if (namePart) lines.push('（本名：' + namePart + '。この人の「下の名前」だけを使って親しみやすい呼び名を作り、名字やフルネームは出力しない）');
  if (!lines.length) return;

  var result = callAI(lines.join('\n'));
  if (!result) return;
  var arr = function (x) { return Array.isArray(x) ? x.join(', ') : (x || ''); };

  put('ニックネーム', result.nickname);
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

  // 学部学年・指導科目はフォーム回答から直接転記（AIより確実）
  var faculty = String(getVal('学部') || '').trim();
  var grade = String(getVal('学年') || '').trim();
  if (grade && grade.indexOf('年') < 0 && /^\d+$/.test(grade)) grade += '年';
  var major = ('神戸大 ' + faculty + ' ' + grade).replace(/\s+/g, ' ').trim();
  if (faculty || grade) put('学部学年', major); else put('学部学年', result.major);
  var subj = String(getVal('指導可能科目') || '').trim();
  put('指導科目', subj || result.subjects);

  put('AI処理日時', new Date());
}

/* 氏名から「下の名前」だけを推定（姓名がスペース区切りなら後半、なければ空） */
function firstNameHint(name) {
  var s = String(name || '').trim();
  if (!s) return '';
  var parts = s.split(/[\s　]+/);
  return parts.length >= 2 ? parts[parts.length - 1] : s;
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
   ===================================================================== */
function callAI(profileText) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です。');

  var prompt =
    'あなたは家庭教師紹介サービスKKMの運営アシスタントです。\n' +
    '神戸大生の応募フォーム回答を読み、指定スキーマのJSONだけを出力してください。\n' +
    '憶測で埋めず、判断材料がない項目は空文字""（配列項目は空配列[]）にしてください。\n' +
    '出力に応募者の名字やフルネームは含めないでください。\n\n' +
    '# 応募者の回答\n' + profileText + '\n\n' +
    '# 出力スキーマ（このキー構成のJSONのみ・説明やコードブロックは不要）\n' +
    '{\n' +
    '  "nickname": "公開用の呼び名。呼び名のヒント（下の名前）があれば、それを短くした親しみやすい形＋「先輩」。なければ空。例: たく先輩",\n' +
    '  "major": "所属（フォームに学部学年があれば空でよい）",\n' +
    '  "subjects": "指導できる科目（フォームに指導可能科目があれば空でよい）",\n' +
    '  "comment": "本人の魅力が伝わる語り口調の一言（60字以内・氏名なし）",\n' +
    '  "origin": "local | city | transfer のいずれか、または空",\n' +
    '  "sibling": "first | middle | last | only のいずれか、または空",\n' +
    '  "childhood": "lessons | free のいずれか、または空",\n' +
    '  "school": ["public | jhs | hs から該当（複数可）"],\n' +
    '  "studystyle": "self | cram のいずれか、または空",\n' +
    '  "aptitude": "effort | inquiry のいずれか、または空",\n' +
    '  "stance": "companion | leader のいずれか、または空",\n' +
    '  "comm": "empathy | logical のいずれか、または空",\n' +
    '  "motivation": ["competition | curiosity | safety から該当（複数可）"]\n' +
    '}\n\n' +
    '# コードの意味\n' +
    'origin: local=地方出身 / city=都市部出身 / transfer=転勤族・引っ越し経験あり（出身校・最寄り駅などから判断）\n' +
    'sibling: first=長子 / middle=中間子 / last=末っ子 / only=一人っ子（兄弟構成から）\n' +
    'childhood: lessons=習い事多め派 / free=のびのび自由派（幼少期の過ごし方から）\n' +
    'school: public=公立中心 / jhs=中学受験経験あり / hs=高校受験経験あり（出身中学高校・入試種別から）\n' +
    'studystyle: self=独学・工夫型 / cram=塾・予備校活用型（中高時代の勉強スタイルから）\n' +
    'aptitude: effort=努力型（苦労して克服）/ inquiry=探求型（昔から勉強好き）（性格・勉強についてから）\n' +
    'stance: companion=伴走型（斜めの関係）/ leader=牽引型（頼れる指導者）（目指す家庭教師像・教え方から）\n' +
    'comm: empathy=じっくり共感・ほめて伸ばす / logical=論理的・的確に課題解決（性格・教え方から）\n' +
    'motivation: competition=競争・達成感 / curiosity=好奇心・面白さ / safety=心理的安全性・安心感（教え方・目指す像から）\n';

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
