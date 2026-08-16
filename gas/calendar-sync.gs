/**
 * Googleカレンダー → 進行アプリ（shinkou-data/data.json）
 *
 * 予定名から「曲」と「工程」を読み取り、
 *   ・日程を持つ工程（VoDB・ChoDB・楽器DB・EDIT・ミックスのスケジュール）→ その日を日程として追加
 *   ・それ以外の工程 → その日を締切として設定
 * を行います。
 *
 * 同じ予定は何度回しても増えません（予定のIDで見分けます）。
 * カレンダー側で日付を動かせば、こちらも動きます。予定を消せば、こちらからも消えます。
 *
 * 使い方
 *   1. スクリプトプロパティに GH_TOKEN（GitHubのトークン）を入れる
 *   2. dryRun() で結果を確かめる
 *   3. sync() を毎朝の時間トリガーに設定する
 */

/* ===================== 設定 ===================== */

var CFG = {
  calendarId: 'j-takasaki@bu.k-cloud90.biz',  // 空にすると既定のカレンダー
  repo:   'gogojoe312-max/shinkou-data',
  path:   'data.json',
  branch: 'main',
  daysBack:    14,   // 何日前から見るか
  daysForward: 120,  // 何日先まで見るか
  tz: 'Asia/Tokyo'
};

/* 予定名に出てくる曲の呼び名 → アプリの曲名。
   ここに無くても、曲名の頭から2文字以上が一致すれば拾います。 */
var SONG_ALIAS = {
  '大凶':        'だって大凶じゃん☆',
  'バッター':     'バッターズボックスはどこ？',
  'なじられ':     'なじられたって泣けない　愛されたって泣けない',
  '直感Kawaii':  '直感！Kawaii',
  '直感':        '直感！Kawaii',
  'ピピピ':       'Pi-Pi-Pit-a-pat！',
  '王道':        '私が王道',
  '貪欲':        '貪欲シンデレラ',
  'ノンフィクション': 'ノンフィクション',
  'もしも':       'もしも',
  'もうどうでも':   'もうどうでもよくなっちゃった'
};

/* 予定名に出てくる曲の位置づけ。「ロージー表題２曲」のようにまとめて指せる */
var SORT_WORDS = [
  { words: ['表題'],               sort: 'single' },
  { words: ['アディショナル', 'カップリング', 'アディショ'], sort: 'add' },
  { words: ['アルバム曲', 'アルバム'], sort: 'album' },
  { words: ['配信'],               sort: 'dl' }
];

/* 予定名に出てくるグループの呼び名 → アプリのグループ名 */
var ARTIST_ALIAS = {
  'OCHA':   'OCHA NORMA',
  'オチャ':   'OCHA NORMA',
  'ロージー':  'ロージークロニクル',
  'ロジクロ':  'ロージークロニクル',
  '譜久村':   '譜久村聖'
};

/* 予定名に出てくる工程。長い言い方から先に見ます。
   sched:true は日程を持つ工程（その日を日程として足す）。 */
var STAGE_RULES = [
  { words: ['ライブTD', 'LiveTD', 'Live TD', 'ライブミックス', 'ライブ用ミックス'], key: 'livemix' },
  { words: ['ChoEDIT', 'コーラスEDIT', 'ChoEdit'],  key: 'choes',  sched: true },
  { words: ['ReVoEDIT', 'ReVoEdit'],                key: 'revoes', sched: true },
  { words: ['VoEDIT', 'VoEdit'],                    key: 'voes',   sched: true },
  { words: ['ChoDB', 'コーラスDB', 'コーラス録り'],    key: 'cho',    sched: true },
  { words: ['ReVoDB', 'リボーカル'],                 key: 'revo',   sched: true },
  { words: ['BUVo', 'バックボーカル'],                key: 'lrecS',  sched: true },
  { words: ['VoDB', '歌録り'],                       key: 'vo',     sched: true },
  { words: ['楽器DB', 'オケDB', '楽器録り'],          key: 'instrec', sched: true },
  { words: ['歌割'],                                 key: 'warigo' },
  { words: ['リズムエディット', 'リズム'],             key: 'rhythm' },
  { words: ['繋ぎ', 'つなぎ'],                        key: 'tsunagi' },
  { words: ['ピッチ'],                               key: 'pitch' },
  { words: ['ラフミックス', 'ラフミ'],                 key: 'rough' },
  { words: ['パラデータ', 'パラ'],                    key: 'para' },
  { words: ['マスタリング', 'マスター'],               key: 'mas' },
  { words: ['TD', 'ミックス'],                       key: 'td' }
];

/* 工程が読めなかったとき、この言葉が入っていれば黙って飛ばします */
var IGNORE = ['リハ', 'ライブ', 'ハロコン', '会議', '準備', 'GP', 'セッション',
              '打ち合わせ', '収録', '本番', 'オーディション', '誕生日',
              'セトリ', 'GV', '大崎', '出張', '休み', '有給'];

/* ===================== 入口 ===================== */

/** 実際に書き込む */
function sync() { run_(false); }

/** 書き込まずに、何が起きるかだけ見る */
function dryRun() { diag_(); run_(true); }

function run_(dry) {
  var data = ghGet_();
  var events = readEvents_();
  var res = apply_(data.json, events);

  var log = [];
  log.push(dry ? '── 下見（書き込みません）' : '── 反映');
  log.push('予定 ' + events.length + '件 ／ 反映 ' + res.hit.length + '件 ／ 見送り ' + res.miss.length + '件');
  log.push('');
  res.hit.forEach(function (x) { log.push('  ' + x); });
  if (res.miss.length) {
    log.push('');
    log.push('  【見送った予定】');
    res.miss.forEach(function (x) { log.push('  ' + x); });
  }

  if (!dry && res.changed) ghPut_(data.sha, res.data);
  if (!dry && !res.changed) log.push('', '  変わりはありませんでした。');

  Logger.log(log.join('\n'));
  return log.join('\n');
}

/* ===================== 調べ用 ===================== */

/** どのアカウントでどのカレンダーを見ているか、予定がどう読めているかを出す */
function diag_() {
  var cal = CFG.calendarId ? CalendarApp.getCalendarById(CFG.calendarId)
                           : CalendarApp.getDefaultCalendar();
  var evs = readEvents_();
  var data = ghGet_().json;
  var songs = (data.songs || []).filter(function (s) { return (s.use || 'master') !== 'live'; });
  var out = ['実行アカウント: ' + Session.getActiveUser().getEmail(),
             'カレンダー: ' + (cal ? cal.getName() + ' / ' + cal.getId() : 'なし'),
             '予定 ' + evs.length + '件 ／ 曲 ' + songs.length + '件', ''];
  evs.slice(0, 10).forEach(function (e) {
    var ig = '';
    for (var i = 0; i < IGNORE.length; i++) {
      if (norm_(e.title).indexOf(norm_(IGNORE[i])) >= 0) { ig = IGNORE[i]; break; }
    }
    var r = findStage_(e.title), sg = findSong_(e.title, songs);
    out.push(e.date + '  「' + e.title + '」');
    out.push('      無視=' + (ig || 'なし') + ' / 工程=' + (r ? r.key : 'なし') +
             ' / 曲=' + (sg ? sg.title : 'なし'));
  });
  Logger.log(out.join('\n'));
}

/* ===================== カレンダー ===================== */

function readEvents_() {
  var cal = CFG.calendarId ? CalendarApp.getCalendarById(CFG.calendarId)
                           : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('カレンダーが見つかりません: ' + CFG.calendarId);

  var from = new Date(); from.setDate(from.getDate() - CFG.daysBack);
  var to   = new Date(); to.setDate(to.getDate() + CFG.daysForward);

  return cal.getEvents(from, to).map(function (e) {
    return {
      id:    e.getId(),
      title: (e.getTitle() || '').trim(),
      date:  Utilities.formatDate(e.getStartTime(), CFG.tz, 'yyyy-MM-dd'),
      place: (e.getLocation() || '').trim()
    };
  });
}

/* ===================== 判定 ===================== */

function norm_(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    })
    .replace(/[\s・･]/g, '')
    .toUpperCase();
}

/** 予定名から工程を読む */
function findStage_(title) {
  var t = norm_(title);
  for (var i = 0; i < STAGE_RULES.length; i++) {
    var r = STAGE_RULES[i];
    for (var j = 0; j < r.words.length; j++) {
      if (t.indexOf(norm_(r.words[j])) >= 0) return r;
    }
  }
  return null;
}

/** 予定名に書いてある曲をすべて拾う */
function findSongs_(title, songs) {
  var t = norm_(title), out = [];
  var add = function (sg) { if (sg && out.indexOf(sg) < 0) out.push(sg); };

  Object.keys(SONG_ALIAS).forEach(function (a) {
    var n = norm_(a);
    if (!n || t.indexOf(n) < 0) return;
    songs.forEach(function (sg) { if (norm_(sg.title) === norm_(SONG_ALIAS[a])) add(sg); });
  });
  songs.forEach(function (sg) {
    var n = norm_(sg.title);
    if (n.length < 2) return;
    for (var len = n.length; len >= 2; len--) {
      if (t.indexOf(n.slice(0, len)) >= 0) { add(sg); return; }
    }
  });
  return out;
}

/** 予定名から曲を読む。見つからなければ null */
function findSong_(title, songs) {
  var t = norm_(title);

  // 呼び名の表
  var best = null, bestLen = 0;
  Object.keys(SONG_ALIAS).forEach(function (a) {
    var n = norm_(a);
    if (n && t.indexOf(n) >= 0 && n.length > bestLen) { best = SONG_ALIAS[a]; bestLen = n.length; }
  });
  if (best) {
    var hit = songs.filter(function (s) { return norm_(s.title) === norm_(best); });
    if (hit.length) return hit[0];
  }

  // 曲名の頭から2文字以上が一致するもの
  var cand = [];
  songs.forEach(function (s) {
    var n = norm_(s.title);
    if (n.length < 2) return;
    for (var len = n.length; len >= 2; len--) {
      if (t.indexOf(n.slice(0, len)) >= 0) { cand.push({ s: s, len: len }); return; }
    }
  });
  if (!cand.length) return null;
  cand.sort(function (a, b) { return b.len - a.len; });
  if (cand.length > 1 && cand[0].len === cand[1].len) return null;  // 決められない
  return cand[0].s;
}

/** 予定名からグループを読む */
function findArtist_(title) {
  var t = norm_(title), best = null, bestLen = 0;
  Object.keys(ARTIST_ALIAS).forEach(function (a) {
    var n = norm_(a);
    if (n && t.indexOf(n) >= 0 && n.length > bestLen) { best = ARTIST_ALIAS[a]; bestLen = n.length; }
  });
  return best;
}

/* ===================== 反映 ===================== */

function apply_(data, events) {
  var songs = (data.songs || []).filter(function (s) { return (s.use || 'master') !== 'live'; });
  var hit = [], miss = [], seen = {}, changed = false;

  events.forEach(function (ev) {
    if (!ev.title) return;

    var rule = findStage_(ev.title);
    if (!rule) {
      for (var i = 0; i < IGNORE.length; i++) {
        if (norm_(ev.title).indexOf(norm_(IGNORE[i])) >= 0) return;
      }
      miss.push(ev.date + '  ' + ev.title + '  … 工程が読めません');
      return;
    }

    var targets = findTargets_(ev, rule, songs, miss);
    targets.forEach(function (song) {
      seen[ev.id] = true;
      if (!song.stages) song.stages = {};
      var o = song.stages[rule.key] || (song.stages[rule.key] = blank_());
      var name = stageName_(song, rule.key);

      if (rule.sched) {
        var slot = (o.slots || []).filter(function (v) { return v.cal === ev.id; })[0];
        if (slot) {
          if (slot.date !== ev.date) {
            slot.date = ev.date; changed = true;
            hit.push(ev.date + '  ' + song.title + ' / ' + name + '  日程を動かしました');
          }
          if (ev.place && !slot.who) { slot.who = ev.place; changed = true; }
        } else {
          if (!o.slots) o.slots = [];
          o.slots.push({ date: ev.date, note: '', who: ev.place || '', swait: false, done: false, cal: ev.id });
          o.slots.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
          changed = true;
          hit.push(ev.date + '  ' + song.title + ' / ' + name + '  日程を追加' +
                   (ev.place ? '（' + ev.place + '）' : ''));
        }
      } else {
        if (o.dl !== ev.date || o.calDl !== ev.id) {
          var before = o.dl;
          o.dl = ev.date; o.calDl = ev.id; changed = true;
          hit.push(ev.date + '  ' + song.title + ' / ' + name +
                   (before ? '  締切 ' + before + ' → ' + ev.date : '  締切を設定'));
        }
      }
    });
  });

  /* カレンダーから消えた予定の分を片づける */
  (data.songs || []).forEach(function (s) {
    Object.keys(s.stages || {}).forEach(function (k) {
      var o = s.stages[k];
      if (o.slots) {
        var keep = o.slots.filter(function (v) { return !v.cal || seen[v.cal]; });
        if (keep.length !== o.slots.length) {
          hit.push('－  ' + s.title + ' / ' + stageName_(s, k) + '  予定が消えたので日程を外しました');
          o.slots = keep; changed = true;
        }
      }
      if (o.calDl && !seen[o.calDl]) {
        hit.push('－  ' + s.title + ' / ' + stageName_(s, k) + '  予定が消えたので締切を自動に戻しました');
        o.dl = ''; delete o.calDl; changed = true;
      }
    });
  });

  if (changed) data.at = new Date().toISOString();
  return { data: data, hit: hit, miss: miss, changed: changed };
}

/** その工程を持っていて、まだ終わっていない曲か */
function open_(song, key) {
  if (!(song.stageList || []).some(function (x) { return x.k === key; })) return false;
  return !((song.stages || {})[key] || {}).done;
}

/** 予定名から、対象になる曲を決める */
function findTargets_(ev, rule, songs, miss) {
  var t = norm_(ev.title);

  /* 曲名がはっきり書いてあれば、それだけ。終わっている工程でも入れる */
  var named = findSongs_(ev.title, songs);
  if (named.length) {
    var ok = named.filter(function (sg) {
      return (sg.stageList || []).some(function (x) { return x.k === rule.key; });
    });
    named.forEach(function (sg) {
      if (ok.indexOf(sg) < 0) {
        miss.push(ev.date + '  ' + ev.title + '  … 「' + sg.title + '」に' + rule.key + 'の工程がありません');
      }
    });
    return ok;
  }

  /* 「ロージー表題２曲」のように、グループ＋位置づけでまとめて指しているか */
  var arts = [];
  Object.keys(ARTIST_ALIAS).forEach(function (a) {
    var n = norm_(a);
    if (n && t.indexOf(n) >= 0 && arts.indexOf(ARTIST_ALIAS[a]) < 0) arts.push(ARTIST_ALIAS[a]);
  });
  if (!arts.length) {
    miss.push(ev.date + '  ' + ev.title + '  … 曲が読めません');
    return [];
  }

  var sorts = [];
  SORT_WORDS.forEach(function (r) {
    r.words.forEach(function (w) {
      if (t.indexOf(norm_(w)) >= 0 && sorts.indexOf(r.sort) < 0) sorts.push(r.sort);
    });
  });

  var out = [];
  arts.forEach(function (art) {
    var list = songs.filter(function (s) {
      return norm_(s.artist) === norm_(art) && open_(s, rule.key);
    });
    if (sorts.length) {
      var narrowed = list.filter(function (s) { return sorts.indexOf(sortOf_(s)) >= 0; });
      /* 位置づけで絞れたら、その全部が対象 */
      if (narrowed.length) { out = out.concat(narrowed); return; }
      miss.push(ev.date + '  ' + ev.title + '  … ' + art + 'に' +
                sorts.join('/') + 'で' + rule.key + '待ちの曲がありません');
      return;
    }
    /* 位置づけが無いときは、1曲に決まるときだけ */
    if (list.length === 1) { out.push(list[0]); return; }
    miss.push(ev.date + '  ' + ev.title + '  … ' + art + 'で' + rule.key +
              '待ちが' + list.length + '曲。曲名か「表題」「アディショナル」を入れてください');
  });

  /* 「２曲」などと数が書いてあれば、合っているか見ておく */
  var num = (ev.title.match(/([0-9０-９一二三四五六七八九十]+)\s*曲/) || [])[1];
  if (num && out.length) {
    var n = toNum_(num);
    if (n && n !== out.length) {
      miss.push(ev.date + '  ' + ev.title + '  … 予定は' + n + '曲ですが、' +
                out.length + '曲に入れます（' + out.map(function (s) { return s.title; }).join('・') + '）');
    }
  }
  return out;
}

function sortOf_(s) {
  return s.sort || (s.single === false ? 'album' : 'single');
}

function toNum_(str) {
  var z = String(str).replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
  if (/^[0-9]+$/.test(z)) return parseInt(z, 10);
  var K = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  return K[z] || 0;
}

function blank_() {
  return { done: false, date: '', dl: '', st: '', req: '', ret: '',
           slots: [], asg: '', rev: 0, size: '', prov: false, memo: '' };
}

function stageName_(song, key) {
  var x = (song.stageList || []).filter(function (z) { return z.k === key; })[0];
  return x ? x.n : key;
}

/* ===================== GitHub ===================== */

function token_() {
  var t = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
  if (!t) throw new Error('スクリプトプロパティ GH_TOKEN が未設定です');
  return t;
}

function ghUrl_() {
  return 'https://api.github.com/repos/' + CFG.repo + '/contents/' + CFG.path;
}

function ghGet_() {
  var r = UrlFetchApp.fetch(ghUrl_() + '?ref=' + CFG.branch, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token_(), Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) {
    throw new Error('読み込みに失敗 ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  }
  var j = JSON.parse(r.getContentText());
  var text = Utilities.newBlob(Utilities.base64Decode(j.content)).getDataAsString('UTF-8');
  return { sha: j.sha, json: JSON.parse(text) };
}

function ghPut_(sha, obj) {
  var body = {
    message: 'カレンダーから反映 ' + Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM-dd HH:mm'),
    content: Utilities.base64Encode(JSON.stringify(obj), Utilities.Charset.UTF_8),
    branch: CFG.branch,
    sha: sha
  };
  var r = UrlFetchApp.fetch(ghUrl_(), {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token_(), Accept: 'application/vnd.github+json' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) {
    throw new Error('書き込みに失敗 ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  }
}

/* ===================== 毎朝動かす ===================== */

function トリガーを作る() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sync').timeBased().atHour(7).everyDays(1)
    .inTimezone(CFG.tz).create();
  Logger.log('毎朝7時に動かします');
}
