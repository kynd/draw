---
title: Drawing Tool
---

<div class="prose">

The drawing tool as an engine with a public API. `DrawingTool` owns everything that ends up in the drawing (the state, the strokes, the palette, replay and recording) and touches no DOM but the canvas it renders into; a UI is a client of the API, forwarding pointer events and calling the control methods. The default UI, the MIDI adapter, and one config class per page complete the instrument, and a custom UI can replace all of them.
<div class="jp">公開APIを持つエンジンとしての描画ツールです。`DrawingTool`は、描画に残るすべて（状態、ストローク、パレット、リプレイと録画）を持ち、描画先のキャンバス以外のDOMには触れません。UIはこのAPIのクライアントとして、ポインタのイベントを転送し、コントロールのメソッドを呼びます。既定のUI、MIDIアダプタ、ページごとの設定クラスがひとつの道具を完成させますが、独自のUIでそのすべてを置き換えられます。</div>

<div class="page-note">
<p><code>public/lib/demo/drawingTool/</code> — <code>DrawingTool.js</code>, <code>DrawingToolConfig.js</code>, <code>ui.js</code>, <code>midi.js</code>, <code>index.js</code> — with <code>toolConfigs.js</code>, <code>toolRegistry.js</code>, and <code>markBuilder.js</code> beside it.</p>
</div>

## Construction

`new DrawingTool(canvas, config)` builds the engine into a canvas. The config is a `DrawingToolConfig`: the tool set (`tools`, ids from the master registry), the initial palette and tool, the preview box, `scatterCount` (random strokes a clear lays down, 0 for a blank canvas), and the pointer trace. The engine's constructor signature never changes; what a config can carry does, so a new setting never touches a construction site. Each page has its own config subclass in `toolConfigs.js`, constructed with no arguments (`new DryMediaDemoConfig()`), and `PlaybackConfig` configures the engine as a playback host.
<div class="jp">`new DrawingTool(canvas, config)`は、キャンバスの上にエンジンを組み立てます。設定は`DrawingToolConfig`で、ツールの集合（`tools`、マスターレジストリのid）、初期のパレットとツール、プレビュー、`scatterCount`（クリア時に描かれるランダムなストロークの本数。0で無地）、ポインタの軌跡を持ちます。エンジンのコンストラクタのシグネチャは変わらず、変わるのは設定が運べる中身なので、設定を増やしても構築側のコードには触れません。各ページは`toolConfigs.js`に自分の設定クラスを持ち、引数なしで構築できます（`new DryMediaDemoConfig()`）。`PlaybackConfig`は、エンジンを再生専用のホストとして構成します。</div>

`setupDrawingTool(config, { root, square })` in `index.js` assembles the whole instrument in one call: the layout, the engine, the default UI, and MIDI. Every try-drawing demo is this one call with its page's config.
<div class="jp">`index.js`の`setupDrawingTool(config, { root, square })`は、レイアウト、エンジン、既定のUI、MIDIを1回の呼び出しで組み立てます。すべてのtry drawingデモは、この呼び出しにページの設定を渡しただけのものです。</div>

## The engine API

**Pointer input:** `pointerDown({ x, y, pressure })`, `pointerMove`, `pointerUp`, `pointerCancel`. Coordinates are CSS pixels relative to the canvas; pressure is 0 to 1, 0 meaning none. The engine attaches no listeners of its own, so a UI always forwards events explicitly, gating pressure to pens in its adapter.
<div class="jp"><strong>ポインタ入力：</strong>`pointerDown({ x, y, pressure })`、`pointerMove`、`pointerUp`、`pointerCancel`。座標はキャンバスに対するCSSピクセルで、筆圧は0から1（0はなし）です。エンジンは自分ではリスナーを付けないため、UIが必ず明示的にイベントを転送し、筆圧をペンに限る判定もUI側のアダプタが行います。</div>

**Dial control:** `stepTool(steps)` walks the trail of rolled tools, ten remembered on each side of the current one, each keeping its width, parameters, and preview; `stepPalette(steps)` walks a palette trail the same way, each new entry moving the key hue by about ten degrees and rolling a fresh theme and seed, so stepping back retrieves the exact palette. A dial, a key, and a MIDI knob all reduce to these two calls; bucketing a continuous control into steps belongs to the caller. The third dial, width, needs no method of its own: it is plain parameter control, `setParams({ width })`, mapped from the dial position.
<div class="jp"><strong>ダイヤル操作：</strong>`stepTool(steps)`は、ロールされたツールの列をたどります。現在のツールの両側に10個ずつが記憶され、各エントリは自分の幅、パラメータ、プレビューを保ちます。`stepPalette(steps)`はパレットの列を同じ方法でたどります。新しいエントリごとに基準の色相が約10度動き、新しいテーマとシードがロールされるため、戻れば同じパレットがそのまま取り出せます。ダイヤルも、キーも、MIDIのノブも、この2つの呼び出しに行き着きます。連続した値をステップに刻むのは呼び出し側の仕事です。3つ目の幅ダイヤルに専用のメソッドはありません。ダイヤル位置から換算した、ただのパラメータ操作（`setParams({ width })`）です。</div>

**Direct control:** `selectTool(id)` picks an exact tool, whose parameters roll once and then stick per tool. `paramSpec` lists the current tool's adjustable parameters, with `width` and `pressure` as reserved keys ahead of the registry's own, so a UI renders one set of controls from one spec; the width spec carries the tool's canonical range, so the panel slider and the dial mapping follow it per tool. `setParams({ key: value })` updates any of them, clamping the width to the range. `setPalette({ hue, theme, seed, count })` updates the palette config partially, `rerollPalette()` draws a new seed under the same config, and `setColors({ colorA, colorB, colors })` overrides the colors until the next palette change. `setAutoRandomize(on)` and `setPointerTrace(on)` set the two toggles.
<div class="jp"><strong>直接操作：</strong>`selectTool(id)`はツールを名指しで選びます。そのパラメータは一度ロールされ、以後はツールごとに保たれます。`paramSpec`は現在のツールで調整できるパラメータを列挙し、レジストリのパラメータの前に予約キーの`width`と`pressure`が並ぶため、UIはひとつの仕様からひとつのコントロール群を描画できます。widthの仕様にはツールごとの標準の幅レンジが入っており、パネルのスライダもダイヤルの換算もツールごとにこのレンジに従います。`setParams({ key: value })`はそのどれでも更新し、幅はレンジに収められます。`setPalette({ hue, theme, seed, count })`はパレット設定を部分的に更新し、`rerollPalette()`は同じ設定のまま新しいシードを引き、`setColors({ colorA, colorB, colors })`は次にパレットが変わるまで色を上書きします。`setAutoRandomize(on)`と`setPointerTrace(on)`は2つのトグルです。</div>

**Canvas and data:** `clear({ background })` starts a fresh take, rolling a paper-light background from the palette when none is given, and laying down the configured scatter. `setGuideImage(image)`, `setGuideOpacity(v)`, and `setGuideVisible(on)` manage the guide overlay; decoding the file stays with the UI. `getDrawingData()` returns the serialized log, `setDrawingData(data)` loads one, `downloadDrawing()` saves it zipped, and `snapshot()` resolves with a PNG of the drawing without the preview, trace, or guide.
<div class="jp"><strong>キャンバスとデータ：</strong>`clear({ background })`は新しいテイクを始めます。背景を渡さなければパレットから紙のように明るい背景をロールし、設定された本数のランダムなストロークを置きます。`setGuideImage(image)`、`setGuideOpacity(v)`、`setGuideVisible(on)`はガイドのオーバーレイを管理します。ファイルの読み込みはUIの仕事です。`getDrawingData()`は直列化されたログを返し、`setDrawingData(data)`はログを読み込み、`downloadDrawing()`はそれをzipで保存し、`snapshot()`は、プレビューも軌跡もガイドも含まない描画のPNGを返します。</div>

**Playback:** `replay()`, `stopReplay()`, and `recordVideo()` are wrappers over the `DrawingPlayer` the engine composes and exposes as `player`, so a UI can drive the full transport (pause, seek, step) on the current drawing. The player is documented on the <a href="/draw/documentation/player">Player</a> page.
<div class="jp"><strong>再生：</strong>`replay()`、`stopReplay()`、`recordVideo()`は、エンジンが内部に持ち`player`として公開している`DrawingPlayer`のラッパーです。そのためUIは、いま描いているものに対してトランスポート全体（一時停止、シーク、コマ送り）を操作できます。プレイヤーについては<a href="/draw/documentation/player">Player</a>のページに記載しています。</div>

**State and events:** `state` is a read-only snapshot (the tool id, the values with width and pressure included, the palette config, the colors, and the replay flags); `registry` is the tool list, for building a menu. `on(event, fn)` and `off` subscribe to `'tool'`, `'palette'`, `'stroke-start'` / `'stroke-end'`, `'clear'` (with the background), `'replay-start'` / `'replay-end'`, `'record-start'` / `'record-end'`, and `'resize'`. Every mutation fires its event whatever its source, so a UI stays in sync by listening rather than by wrapping each call.
<div class="jp"><strong>状態とイベント：</strong>`state`は読み取り専用のスナップショットです（ツールのid、widthとpressureを含む値、パレット設定、色、再生中かどうか）。`registry`はメニューを作るためのツール一覧です。`on(event, fn)`と`off`で、`'tool'`、`'palette'`、`'stroke-start'`／`'stroke-end'`、`'clear'`（背景付き）、`'replay-start'`／`'replay-end'`、`'record-start'`／`'record-end'`、`'resize'`を購読できます。どこから状態が変わってもイベントは発火するため、UIは呼び出しを包む代わりに、購読するだけで同期を保てます。</div>

## The default UI and MIDI

`ui.js` builds what the pages show: the settings panel on the right, the three floating dials (hue stepping the palette on every value change, tool bucketed into steps, width mapped directly), the overlay toggle, fullscreen and the canvas size, and the guide file picker. Every handler is an API call and every display update a subscription; nothing in the engine references it. `midi.js` maps control change 16 and 17 onto the two step calls and 18 onto the width, driving the UI's dials when they exist so the knobs and dials stay one control.
<div class="jp">`ui.js`は、ページに見えているものを組み立てます。右側の設定パネル、3つの浮かぶダイヤル（色相は値が変わるたびにパレットを進め、ツールはステップに刻まれ、幅はそのまま換算されます）、オーバーレイの切り替え、フルスクリーンとキャンバスサイズ、ガイドのファイル選択です。すべてのハンドラはAPIの呼び出しで、すべての表示の更新は購読です。エンジンはこのファイルを参照しません。`midi.js`はコントロールチェンジの16と17を2つのステップ呼び出しに、18を幅に割り当てます。既定のUIのダイヤルがあればそれを動かすので、ノブとダイヤルはひとつのコントロールとして振る舞います。</div>

## The tool registry

A registry is a list of entries, each `{ id, kind, params, make }`. `id` names the tool in records, so it must stay stable; `kind` is `'stroke'`, `'blob'`, or `'shape'` (a shape entry also carries `contour(a, b, seed)`, building its closed contour from the gesture's endpoints alone); `params` lists what the tool randomizes, each `{ key, min, max, step }` for a range or `{ key, pick }` for a choice; `width: [min, max]` is the tool's canonical width range in pixels (2 to 64 when omitted, narrower for fine media like the pencil); `pressure` is the tool's pressure swing as a ratio around the set width (2 when omitted; a pencil barely moves, a watercolor swings to 3); `make(values, ctx)` returns a renderer built from the rolled values and the context.
<div class="jp">レジストリはエントリのリストで、各エントリは`{ id, kind, params, make }`です。`id`は記録の中でツールを指すため、変えてはいけません。`kind`は`'stroke'`、`'blob'`、`'shape'`のいずれかです（shapeのエントリは`contour(a, b, seed)`も持ち、身振りの端点だけから閉じた輪郭を作ります）。`params`はツールがランダム化するものを列挙し、各項目は範囲なら`{ key, min, max, step }`、選択なら`{ key, pick }`です。`width: [min, max]`はツールの標準の幅レンジ（ピクセル）で、省略すると2から64、鉛筆のような細い画材ではより狭くなります。`pressure`は、設定した幅を中心にした筆圧の振れ幅（倍率）です。省略すると2で、鉛筆はほとんど動かず、水彩は3まで振れます。`make(values, ctx)`は、ロールされた値とコンテキストからレンダラを作って返します。</div>

`ctx` carries `colorA` (the palette's key color), `colorB`, `colors` (every palette color), `texture` (the canvas, for tools that read the background), `seed`, `start` and `end` (the drawn chord's world points), and `tintLight` (the main color lightened, for metals). `toolRegistry` is the master list of every tool on the site; `pickTools(ids)` returns a page's subset, `randomValues(entry)` rolls an entry's parameters, and `toolLabel(entry)` turns an id into a display name.
<div class="jp">`ctx`には、`colorA`（パレットの基準の色）、`colorB`、`colors`（パレットのすべての色）、`texture`（背景を読むツールのためのキャンバス）、`seed`、`start`と`end`（描かれた弦のワールド座標）、`tintLight`（金属のためにメインの色を明るくしたもの）が入ります。`toolRegistry`はサイト上のすべてのツールのマスターリストです。`pickTools(ids)`はページごとの部分集合を返し、`randomValues(entry)`はエントリのパラメータをロールし、`toolLabel(entry)`はidを表示名に変えます。</div>

## Mark building

`makeMarkBuilder({ state, board })` returns a draw cycle `build`: it turns one piece's smoothed path and raw points into a mark with the state's current tool. A stroke tool gets a width tapered by arc length, scaled around the set width by pressure (middle pressure draws it as set, the swing per tool from its `pressure` range, through the dead-zone response) and clamped by the slope limit; a blob tool gets a contour from `blobOutline` with a radius scaled the same way by the average pressure; a shape tool gets its contour from its own `contour` on the piece's endpoints, with neither width nor pressure applied. `state.seedOverride`, set while a replayed record drives the cycle, replaces the cycle's seed so seeded looks reproduce.
<div class="jp">`makeMarkBuilder({ state, board })`は描画サイクルの`build`を返します。ひとつの断片の滑らかにされたパスと生の点を、状態の現在のツールで筆跡に変えます。ストロークのツールの幅は、弧長に沿って先細りし、筆圧によって設定した幅を中心に伸縮し（中間の筆圧で設定どおり。振れ幅はツールの`pressure`から、デッドゾーンの応答を通して決まる）、傾き制限で抑えられます。ブロブのツールは、平均筆圧で同じように伸縮する半径で`blobOutline`から輪郭を得ます。shapeのツールは、断片の端点に対して自身の`contour`から輪郭を得ます。幅も筆圧も適用されません。`state.seedOverride`は、リプレイされた記録がサイクルを駆動している間に設定され、サイクルのシードを置き換えます。そのためシード付きの見た目が再現されます。</div>

`applyRecordTo(state, record, registry)` restores one record's tool, parameters, and colors into a state ahead of feeding its points, carrying the record's seed in `seedOverride`.
<div class="jp">`applyRecordTo(state, record, registry)`は、点を流し込む前に、ひとつの記録のツール、パラメータ、色を状態に戻します。記録のシードは`seedOverride`に入ります。</div>

</div>
