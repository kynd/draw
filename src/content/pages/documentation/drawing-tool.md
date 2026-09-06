---
title: Drawing Tool
---

<div class="prose">

The drawing tool as a reusable component: `setupDrawingTool` takes a registry of tools and builds the whole instrument around it — the canvas, the dials, the settings panel, the preview, replay, recording, and the guide image. Every drawing surface on the site is this component with a different registry.
<div class="jp">再利用可能なコンポーネントとしての描画ツールです。`setupDrawingTool`はツールのレジストリを受け取り、その周りに楽器全体、つまりキャンバス、ダイヤル、設定パネル、プレビュー、リプレイ、録画、ガイド画像を組み立てます。このサイトのすべての描画面は、このコンポーネントにそれぞれ別のレジストリを渡したものです。</div>

<div class="page-note">
<p><code>public/lib/demo/drawingTool.js</code>, <code>public/lib/demo/toolRegistry.js</code>, <code>public/lib/demo/markBuilder.js</code></p>
</div>

## setupDrawingTool

`setupDrawingTool({ registry, root, square })` injects its interface into `root` (the document body by default) and wires everything up. `registry` is the list of tools; `square` adds the square embedded layout for pages that reserve one. The component owns its state: the current tool, its parameter values, the width, the pressure sensitivity, and the palette (a `ThemedPaletteMaker` configuration: a key hue, a theme, and a seed).
<div class="jp">`setupDrawingTool({ registry, root, square })`は、インターフェースを`root`（既定ではdocumentのbody）に注入し、すべてを配線します。`registry`はツールのリストです。`square`は、正方形の埋め込みレイアウトを確保しているページ向けに、そのレイアウトを追加します。コンポーネントは状態を自分で持ちます。現在のツール、そのパラメータ値、幅、筆圧の感度、そしてパレット（`ThemedPaletteMaker`の設定、すなわち基準の色相、テーマ、シード）です。</div>

The interface: a settings panel on the right, open by default, holding every control but the two floating dials. Each hue dial step moves the palette's key hue by about ten degrees (randomized per step) and rolls a fresh theme; the tool dial walks a trail of rolled tools, ten remembered on each side of the current one. Changing the tool, and every release of the pen, rerolls the palette's jitter under the same hue and theme, so the key color holds while the rest of the palette moves. Both dials listen to MIDI controls 16 and 17. The interface fades while the pen is down.
<div class="jp">インターフェースの右側には、既定で開いた設定パネルがあり、浮かんでいる2つのダイヤル以外のすべてのコントロールをそこに収めます。色相ダイヤルは1ステップごとに、パレットの基準の色相を約10度（ステップごとにランダム化されます）動かし、新しいテーマをロールします。ツールダイヤルは、現在のツールの両側に10個ずつ記憶された、ロールされたツールの列をたどります。ツールを変えたとき、そしてペンを離すたびに、同じ色相とテーマのままパレットの揺らぎが引き直されます。そのため基準の色は保たれ、残りの色が動きます。どちらのダイヤルもMIDIコントロールの16と17に反応します。ペンを下ろしている間は、インターフェースが薄くなります。</div>

Every committed piece is recorded (tool, parameters, colors, seed, and drawn points), so Replay redraws everything since the last clear through the same cycle, Record saves that playback as a video, and Download saves the log itself as a zip of JSON for the Player.
<div class="jp">確定したすべての断片は記録されます（ツール、パラメータ、色、シード、描かれた点）。そのためReplayは最後のクリア以降のすべてを同じサイクルで描き直し、Recordはその再生をビデオとして保存し、DownloadはログそのものをPlayer用のJSONのzipとして保存します。</div>

## The tool registry

A registry is a list of entries, each `{ id, kind, params, make }`. `id` names the tool in records, so it must stay stable; `kind` is `'stroke'` or `'blob'`; `params` lists what the tool randomizes, each `{ key, min, max, step }` for a range or `{ key, pick }` for a choice; `make(values, ctx)` returns a renderer built from the rolled values and the context.
<div class="jp">レジストリはエントリのリストで、各エントリは`{ id, kind, params, make }`です。`id`は記録の中でツールを指すため、変えてはいけません。`kind`は`'stroke'`か`'blob'`です。`params`はツールがランダム化するものを列挙し、各項目は範囲なら`{ key, min, max, step }`、選択なら`{ key, pick }`です。`make(values, ctx)`は、ロールされた値とコンテキストからレンダラを作って返します。</div>

`ctx` carries `colorA` (the palette's key color), `colorB`, `colors` (every palette color), `texture` (the canvas, for tools that read the background), `seed`, `start` and `end` (the drawn chord's world points), and `tintLight` (the main color lightened, for metals). `toolRegistry` is the master list of every tool on the site; `pickTools(ids)` returns a page's subset, `randomValues(entry)` rolls an entry's parameters, and `toolLabel(entry)` turns an id into a display name.
<div class="jp">`ctx`には、`colorA`（パレットの基準の色）、`colorB`、`colors`（パレットのすべての色）、`texture`（背景を読むツールのためのキャンバス）、`seed`、`start`と`end`（描かれた弦のワールド座標）、`tintLight`（金属のためにメインの色を明るくしたもの）が入ります。`toolRegistry`はサイト上のすべてのツールのマスターリストです。`pickTools(ids)`はページごとの部分集合を返し、`randomValues(entry)`はエントリのパラメータをロールし、`toolLabel(entry)`はidを表示名に変えます。</div>

## Mark building

`makeMarkBuilder({ state, board })` returns a draw cycle `build`: it turns one piece's smoothed path and raw points into a mark with the state's current tool. A stroke tool gets a width tapered by arc length, widened by pressure through the dead-zone response and clamped by the slope limit; a blob tool gets a contour from `blobOutline` with a radius scaled by the average pressure. `state.seedOverride`, set while a replayed record drives the cycle, replaces the cycle's seed so seeded looks reproduce.
<div class="jp">`makeMarkBuilder({ state, board })`は描画サイクルの`build`を返します。ひとつの断片の滑らかにされたパスと生の点を、状態の現在のツールで印に変えます。ストロークのツールの幅は、弧長に沿って先細りし、デッドゾーンの応答を通した筆圧で太くなり、傾き制限で抑えられます。ブロブのツールは、平均筆圧に応じた半径で`blobOutline`から輪郭を得ます。`state.seedOverride`は、リプレイされた記録がサイクルを駆動している間に設定され、サイクルのシードを置き換えます。そのためシード付きの見た目が再現されます。</div>

`applyRecordTo(state, record, registry)` restores one record's tool, parameters, and colors into a state ahead of feeding its points, carrying the record's seed in `seedOverride`.
<div class="jp">`applyRecordTo(state, record, registry)`は、点を流し込む前に、ひとつの記録のツール、パラメータ、色を状態に戻します。記録のシードは`seedOverride`に入ります。</div>

</div>
