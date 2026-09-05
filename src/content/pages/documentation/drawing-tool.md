---
title: Drawing Tool
---

<div class="prose">

The drawing tool as a reusable component: `setupDrawingTool` takes a registry of tools and builds the whole instrument around it — the canvas, the dials, the settings panel, the preview, replay, recording, and the guide image. Every drawing surface on the site is this component with a different registry.
<div class="jp">再利用可能なコンポーネントとしての描画ツールです。`setupDrawingTool`はツールのレジストリを受け取り、その周りに楽器全体、つまりキャンバス、ダイヤル、設定パネル、プレビュー、リプレイ、録画、ガイド画像を組み立てます。このサイトのすべての描画面は、異なるレジストリを持つこのコンポーネントです。</div>

<div class="page-note">
<p><code>public/lib/demo/drawingTool.js</code>, <code>public/lib/demo/toolRegistry.js</code>, <code>public/lib/demo/markBuilder.js</code></p>
</div>

## setupDrawingTool

`setupDrawingTool({ registry, root, square })` injects its interface into `root` (the document body by default) and wires everything up. `registry` is the list of tools; `square` adds the square embedded layout for pages that reserve one. The component owns its state: the current tool, its parameter values, the width, the pressure sensitivity, the two key colors, and the palette.
<div class="jp">`setupDrawingTool({ registry, root, square })`は、インターフェースを`root`（既定ではdocumentのbody）に注入し、すべてを配線します。`registry`はツールのリストです。`square`は、正方形の埋め込みレイアウトを確保しているページのためにそれを加えます。コンポーネントは自分の状態、つまり現在のツール、そのパラメータ値、幅、筆圧の感度、2つのキーカラー、パレットを持ちます。</div>

The interface: a settings panel on the right, open by default, holding every control but the two floating dials. The hue dial rotates the palette with a rerolled chroma biased vivid; the tool dial walks a trail of rolled tools, ten remembered on each side of the current one. Changing the tool re-picks every color it uses but the main one. Both dials listen to MIDI controls 16 and 17. The interface fades while the pen is down.
<div class="jp">インターフェースは、右側に既定で開いた設定パネルがあり、浮かぶ2つのダイヤル以外のすべてのコントロールを収めます。色相ダイヤルは、鮮やかな側に偏って引き直された彩度でパレットを回します。ツールダイヤルは、現在のツールの両側に10個ずつ記憶された、ロールされたツールの列をたどります。ツールを変えると、メインの色以外のツールが使うすべての色が選び直されます。どちらのダイヤルもMIDIコントロール16と17を聞きます。ペンを置いている間、インターフェースは消えます。</div>

Every committed piece is recorded (tool, parameters, colors, seed, and drawn points), so Replay redraws everything since the last clear through the same cycle, Record saves that playback as a video, and Download saves the log itself as a zip of JSON for the Player.
<div class="jp">確定したすべての断片は記録されます（ツール、パラメータ、色、シード、描かれた点）。そのためReplayは最後のClear以降のすべてを同じサイクルで描き直し、Recordはその再生をビデオとして保存し、Downloadはログそのものを、Playerのために JSONのzipとして保存します。</div>

## The tool registry

A registry is a list of entries, each `{ id, kind, params, make }`. `id` names the tool in records, so it must stay stable; `kind` is `'stroke'` or `'blob'`; `params` lists what the tool randomizes, each `{ key, min, max, step }` for a range or `{ key, pick }` for a choice; `make(values, ctx)` returns a renderer built from the rolled values and the context.
<div class="jp">レジストリはエントリのリストで、各エントリは`{ id, kind, params, make }`です。`id`は記録の中でツールを指すため、変えてはいけません。`kind`は`'stroke'`か`'blob'`です。`params`はツールがランダム化するものを列挙し、各項目は範囲なら`{ key, min, max, step }`、選択なら`{ key, pick }`です。`make(values, ctx)`は、ロールされた値とコンテキストからレンダラを作って返します。</div>

`ctx` carries `colorA`, `colorB`, `colors` (the palette's dark entries), `texture` (the canvas, for tools that read the background), `seed`, `start` and `end` (the drawn chord's world points), and `tintLight` (the main color lightened, for metals). `toolRegistry` is the master list of every tool on the site; `pickTools(ids)` returns a page's subset, `randomValues(entry)` rolls an entry's parameters, and `toolLabel(entry)` turns an id into a display name.
<div class="jp">`ctx`は`colorA`、`colorB`、`colors`（パレットの暗い項目）、`texture`（背景を読むツールのためのキャンバス）、`seed`、`start`と`end`（描かれた弦のワールド座標）、`tintLight`（金属のための、明るくしたメインの色）を運びます。`toolRegistry`はサイト上のすべてのツールのマスターリストです。`pickTools(ids)`はページごとの部分集合を返し、`randomValues(entry)`はエントリのパラメータをロールし、`toolLabel(entry)`はidを表示名に変えます。</div>

## Mark building

`makeMarkBuilder({ state, board })` returns a draw cycle `build`: it turns one piece's smoothed path and raw points into a mark with the state's current tool. A stroke tool gets a width tapered by arc length, widened by pressure through the dead-zone response and clamped by the slope limit; a blob tool gets a contour from `blobOutline` with a radius scaled by the average pressure. `state.seedOverride`, set while a replayed record drives the cycle, replaces the cycle's seed so seeded looks reproduce.
<div class="jp">`makeMarkBuilder({ state, board })`は描画サイクルの`build`を返します。ひとつの断片の滑らかにされたパスと生の点を、状態の現在のツールで印に変えます。ストロークのツールは、弧長でテーパーし、デッドゾーンの応答を通した筆圧で太くなり、傾き制限で抑えられた幅を得ます。ブロブのツールは、平均筆圧に比例した半径で`blobOutline`から輪郭を得ます。`state.seedOverride`は、リプレイされた記録がサイクルを駆動している間に設定され、サイクルのシードを置き換えます。そのためシード付きの見た目が再現されます。</div>

`applyRecordTo(state, record, registry)` restores one record's tool, parameters, and colors into a state ahead of feeding its points, carrying the record's seed in `seedOverride`.
<div class="jp">`applyRecordTo(state, record, registry)`は、点を流し込む前に、ひとつの記録のツール、パラメータ、色を状態に戻します。記録のシードは`seedOverride`に運ばれます。</div>

</div>
