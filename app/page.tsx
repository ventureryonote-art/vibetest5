// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 体験授業の問い合わせ台帳
//   LINE・電話・HP・紹介からバラバラに来る問い合わせを1か所に集め、
//   「今日返信すべき保護者」が一目で分かるようにする画面。
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
//  画面の型 ── docs/03_spec.md の「0. 画面の型」のとおりに設定
//  ⚠ 新しいCSSは書かない。選択肢から選ぶだけ。
// ═══════════════════════════════════════════════════════════

/** 色み。教育・スクールなので "pine" */
const TONE = "pine";

/** 密度。問い合わせは月30〜50名（1日1〜2名）、溜まっても10名前後なので "normal" */
const DENSITY = "normal";

/** 画面の型。「今日返信すべき人が一目で」＝待たせている順に片づける "queue" */
const LAYOUT: "queue" | "stage" | "due" = "queue";

/** 数え方。数えているのは書類ではなく人（保護者）なので "名" */
const UNIT = "名";

/** 区分の選択肢＝問い合わせが来る経路 */
const CATEGORIES = ["LINE", "電話", "HP", "紹介"];

// ═══════════════════════════════════════════════════════════

/** 1名分の問い合わせ。項目は5つ（docs/03_spec.md「4. データ項目」） */
type Inquiry = {
  id: string;
  parent: string;   // 保護者名（お子さんの学年）
  route: string;    // 問い合わせ経路（LINE / 電話 / HP / 紹介）
  memo: string;     // 用件メモ
  askedOn: string;  // 問い合わせ日 YYYY-MM-DD
  replied: boolean; // 返信済みか
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "taiken-inquiries";
const NAME_KEY = "taiken-appname";

/** 画面の型ごとの言葉。ここを直せば画面じゅうの文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "まだ返信していない方が、待たせている順に並びます",
    open: "未返信", done: "返信済み",
    toTo: "返信済みにする", toBack: "未返信に戻す",
    dateLabel: "問い合わせ日", catLabel: "問い合わせ経路",
    stat2: "3日以上 待たせている",
    headOpen: "未返信（待たせている順）",
  },
  stage: {
    sub: "どの段階で止まっているかが分かります",
    open: "進行中", done: "完了",
    toTo: "完了にする", toBack: "進行中に戻す",
    dateLabel: "受け入れた日", catLabel: "いまの段階",
    stat2: "7日以上 動きなし",
    headOpen: "進行中",
  },
  due: {
    sub: "期限が近い順に並びます",
    open: "未完了", done: "完了",
    toTo: "完了にする", toBack: "未完了に戻す",
    dateLabel: "期限", catLabel: "種別",
    stat2: "期限切れ",
    headOpen: "未完了（期限が近い順）",
  },
}[LAYOUT];

/** n日前の日付。マイナスを渡すとn日後 */
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const today = () => ago(0);

/** 今日との差。0=今日、-3=3日過ぎている、+2=あと2日 */
const diff = (d: string) =>
  Math.round(
    (new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000
  );

/** 何日待たせているか */
const waiting = (d: string) => Math.max(0, -diff(d));

/**
 * 見本データ。⚠ 実在の人名・連絡先は使わない（すべて架空）
 * 未返信9名 / 返信済み5名 の14名。日付は ago(n) で「今日から何日前」
 */
const SAMPLE: Inquiry[] = [
  { id: "s01", parent: "佐藤さん（中2）", route: "LINE", memo: "数学と英語、週2希望。木曜以外",         askedOn: ago(0),  replied: false },
  { id: "s02", parent: "田村さん（小5）", route: "電話", memo: "折り返し希望 18時以降",                askedOn: ago(1),  replied: false },
  { id: "s03", parent: "鈴木さん（高1）", route: "紹介", memo: "在籍生のご家族から。物理を見てほしい",  askedOn: ago(1),  replied: false },
  { id: "s04", parent: "中村さん（中3）", route: "HP",   memo: "受験相談。志望校はまだ決めていない",    askedOn: ago(2),  replied: false },
  { id: "s05", parent: "渡辺さん（中2）", route: "紹介", memo: "平日夕方のみ。部活が19時まで",          askedOn: ago(3),  replied: false },
  { id: "s06", parent: "小林さん（中1）", route: "LINE", memo: "体験授業の日程を調整中",               askedOn: ago(4),  replied: false },
  { id: "s07", parent: "松本さん（小4）", route: "HP",   memo: "きょうだい割について聞かれている",      askedOn: ago(5),  replied: false },
  { id: "s08", parent: "山口さん（小6）", route: "電話", memo: "料金表を送ってほしいとのこと",          askedOn: ago(7),  replied: false },
  { id: "s09", parent: "吉田さん（高2）", route: "LINE", memo: "夏期講習の残席を確認したい",            askedOn: ago(9),  replied: false },
  { id: "s10", parent: "井上さん（中3）", route: "電話", memo: "体験は来週火曜18時で確定",              askedOn: ago(12), replied: true },
  { id: "s11", parent: "清水さん（高3）", route: "LINE", memo: "料金表を送付済み。返事待ち",            askedOn: ago(14), replied: true },
  { id: "s12", parent: "森さん（小3）",   route: "紹介", memo: "体験のあと入会。4月から週1",            askedOn: ago(16), replied: true },
  { id: "s13", parent: "大野さん（中1）", route: "HP",   memo: "他塾と比較検討中とのこと",              askedOn: ago(18), replied: true },
  { id: "s14", parent: "岡田さん（高1）", route: "LINE", memo: "今回は見送りとご連絡あり",              askedOn: ago(21), replied: true },
];

/** 一覧をどう束ねるか */
type Group = { key: string; label: string; mark?: "late" | "now"; items: Inquiry[] };

function grouped(list: Inquiry[], filter: Filter): Group[] {
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";

  if (LAYOUT === "stage" && filter === "open") {
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      mark: undefined,
      items: list.filter((i) => i.route === c),
    })).filter((g) => g.items.length > 0);
  }

  if (LAYOUT === "due" && filter === "open") {
    const buckets: Group[] = [
      { key: "late",  label: "期限が過ぎている", mark: "late", items: [] },
      { key: "now",   label: "今日・明日",       mark: "now",  items: [] },
      { key: "week",  label: "今週のうち",                     items: [] },
      { key: "later", label: "それ以降",                       items: [] },
    ];
    list.forEach((i) => {
      const d = diff(i.askedOn);
      if (d < 0) buckets[0].items.push(i);
      else if (d <= 1) buckets[1].items.push(i);
      else if (d <= 7) buckets[2].items.push(i);
      else buckets[3].items.push(i);
    });
    return buckets.filter((b) => b.items.length > 0);
  }

  return [{ key: "all", label: head, items: list }];
}

/** 行の右に出す小さなバッジ。3日以上待たせていたら色が変わる */
function rowBadge(r: Inquiry): { text: string; kind: "warn" | "danger" } | null {
  if (r.replied) return null;
  if (LAYOUT === "due") {
    const d = diff(r.askedOn);
    if (d < 0) return { text: `${-d}日 超過`, kind: "danger" };
    if (d === 0) return { text: "今日", kind: "warn" };
    return null;
  }
  const w = waiting(r.askedOn);
  const limit = LAYOUT === "stage" ? 7 : 3;
  return w >= limit ? { text: `${w}日`, kind: "warn" } : null;
}

export default function Home() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [appName, setAppName] = useState("体験授業の問い合わせ");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Inquiry | null>(null);

  const [form, setForm] = useState({ parent: "", route: CATEGORIES[0], memo: "", askedOn: today() });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Inquiry[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  // 見本データのまま触っていない状態か（1名でも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !i.replied).length,
      done: items.filter((i) => i.replied).length,
      all: items.length,
    }),
    [items]
  );

  /** 2つ目の統計＝3日以上待たせている人数 */
  const attention = useMemo(() => {
    const open = items.filter((i) => !i.replied);
    if (LAYOUT === "due") return open.filter((i) => diff(i.askedOn) < 0).length;
    const limit = LAYOUT === "stage" ? 7 : 3;
    return open.filter((i) => waiting(i.askedOn) >= limit).length;
  }, [items]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !i.replied : i.replied))
      .filter((i) => !k || (i.parent + i.memo + i.route).toLowerCase().includes(k))
      .sort((a, b) => a.askedOn.localeCompare(b.askedOn));
  }, [items, filter, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ parent: "", route: CATEGORIES[0], memo: "", askedOn: today() });
    setEditing(null);
  }

  function save() {
    const parent = form.parent.trim();
    if (!parent) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, parent } : i)));
    } else {
      setItems([...items, { id: String(Date.now()), ...form, parent, replied: false }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Inquiry) {
    setEditing(r);
    setForm({ parent: r.parent, route: r.route, memo: r.memo, askedOn: r.askedOn });
    setView("new");
  }

  const toggle = (id: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, replied: !i.replied } : i)));
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: { [K in View]: [string, string] } = {
    list: ["一覧", TEXT.sub],
    new: [editing ? "編集" : "新規登録", "入力して保存すると、一覧に追加されます"],
    settings: ["設定", "表示名の変更と、データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">3日以上お待たせしている方は、日数の色が変わります</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              {isSample && (
                <div className="notice">
                  表示中のデータは<b>見本</b>です。そのまま触って試せます。
                  消したいときは、左メニューの<b>設定</b>から。
                </div>
              )}

              <div className="stats">
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">{TEXT.open}</div></div>
                <div className="stat"><div className="n">{attention}</div><div className="l">{TEXT.stat2}</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全部</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="保護者名・用件で検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `${TEXT.open} ${counts.open}`
                        : f === "done" ? `${TEXT.done} ${counts.done}`
                        : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                {shown.length === 0 ? (
                  <>
                    <div className="list-head">
                      {filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて"}
                      <span className="count">0 {UNIT}</span>
                    </div>
                    <div className="empty">
                      <div className="t">
                        {q ? "見つかりませんでした"
                          : filter === "open" ? "未返信の方はいません" : "ここに表示するものがありません"}
                      </div>
                      <div className="d">
                        {q ? "検索の言葉を変えてみてください。"
                          : filter === "open" ? "今日の分は片づいています。新しい問い合わせは右上の「新規登録」から。"
                          : "右上の「新規登録」から追加できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className={"group-head" + (g.mark ? ` is-${g.mark}` : "")}>
                        {g.mark && <span className="dot" />}
                        {g.label}
                        <span className="count">{g.items.length} {UNIT}</span>
                      </div>
                      {g.items.map((r) => {
                        const b = rowBadge(r);
                        return (
                          <div className="row" key={r.id}>
                            <div className="row-main">
                              <div className="row-title">{r.parent}</div>
                              {r.memo && <div className="row-sub">{r.memo}</div>}
                            </div>
                            <div className="row-meta">
                              {b && <span className={`badge badge-${b.kind}`}>{b.text}</span>}
                              {!(LAYOUT === "stage" && filter === "open") && (
                                <span className="badge">{r.route}</span>
                              )}
                              <span className="row-time">{r.askedOn.slice(5).replace("-", "/")}</span>
                              <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                              <button className="btn-ghost" onClick={() => toggle(r.id)}>
                                {r.replied ? TEXT.toBack : TEXT.toTo}
                              </button>
                              <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-parent">保護者名<span className="req">必須</span></label>
                <input id="f-parent" className="field" value={form.parent}
                  onChange={(e) => setForm({ ...form, parent: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：佐藤さん（小5）" />
                <span className="hint">お子さんの学年まで入れておくと、あとで誰か分かります</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-route">{TEXT.catLabel}</label>
                    <select id="f-route" className="select" value={form.route}
                      onChange={(e) => setForm({ ...form, route: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-date">{TEXT.dateLabel}</label>
                    <input id="f-date" className="field" type="date" value={form.askedOn}
                      onChange={(e) => setForm({ ...form, askedOn: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-memo">用件メモ</label>
                <textarea id="f-memo" className="field" value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  placeholder="希望曜日・科目・折り返してほしい時間など" />
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.parent.trim()}>
                  {editing ? "保存する" : "一覧に追加"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この1{UNIT}を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(SAMPLE)}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} {UNIT}（{TEXT.open} {counts.open} / {TEXT.done} {counts.done}）
                </span>
              </div>

              <p className="note">
                保護者名は個人情報です。この端末のブラウザにだけ保存され、外部には送信されません。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
