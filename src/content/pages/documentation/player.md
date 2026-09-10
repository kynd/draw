---
title: Player
---

<div class="prose">

Recording and playback for drawings. A drawing's log is data, not raster: the canvas size, the starting background, and one record per committed mark. `StrokeRecorder` collects the log while drawing, and `DrawingPlayer` runs a full transport over one — play, pause, seek, step, rewind, finish — records the playback to a video, and serializes the log to and from a file.
<div class="jp">描画の記録と再生です。描画のログはラスタではなくデータで、キャンバスのサイズ、開始時の背景、確定した筆跡ごとの記録からなります。`StrokeRecorder`は描いている間にログを集めます。`DrawingPlayer`は、ひとつのログの上でトランスポート全体（再生、一時停止、シーク、コマ送り、巻き戻し、最後まで進める）を動かし、再生をビデオに録画し、ログをファイルへ直列化し、ファイルから読み戻します。</div>

<div class="page-note">
<p><code>public/lib/demo/strokeRecorder.js</code>, <code>public/lib/demo/drawingPlayer.js</code></p>
</div>

## The record

A record carries everything needed to rebuild one mark: `toolId`, the parameter `values`, `widthPx`, `sens`, `colorA`, `colorB`, `colors`, `seed`, and the drawn `points` with their pressures. Only drawn points are stored, so blank time costs nothing and a playback skips it by construction. The `toolId` names an entry in a registry, so the log stays valid as long as the ids do. A sharp turn splits one gesture into several records; the one the pen lifted after carries `release: true`.
<div class="jp">記録には、ひとつの筆跡を作り直すのに必要なすべてが入っています。`toolId`、パラメータの`values`、`widthPx`、`sens`、`colorA`、`colorB`、`colors`、`seed`、そして筆圧付きの描かれた`points`です。保存されるのは描かれた点だけなので、何も描いていない時間にはコストがかからず、再生では構造上スキップされます。`toolId`はレジストリのエントリを指すため、idが変わらない限りログは有効です。急な方向転換はひとつのジェスチャを複数の記録に分割します。ペンが離れた直前の記録が`release: true`を持ちます。</div>

## StrokeRecorder

`begin(background)` starts a new take, as a clear does, storing the background spec (a color or a gradient description). `add(record, points)` appends one committed mark, copying the points as plain `{ x, y, pressure }`; `markRelease()` marks the last record as a release. The recorder's `{ background, records }` is the log.
<div class="jp">`begin(background)`は、クリアと同じように新しいテイクを始め、背景の指定（色かグラデーションの記述）を保存します。`add(record, points)`は確定した筆跡をひとつ追加し、点を素の`{ x, y, pressure }`としてコピーします。`markRelease()`は最後の記録をリリースとして印を付けます。レコーダーの`{ background, records }`がログです。</div>

## DrawingPlayer

The player owns no interface and no scene. It reaches the surface through callbacks given to the constructor, and everything they restore comes out of the log: `feed(points, done)` hands points to whatever cycle the host wires up, as if a pen produced them; `applyRecord(record)` restores one record's tool and colors before its points; `clear(background)` resets the surface to the log's background; `resize(width, height)` (optional) applies the log's canvas size before the first clear; `canvas` is the surface the video capture streams from. `DrawingTool` composes one and exposes it as `player`; a page that only plays drawings uses the engine headless with `PlaybackConfig` rather than wiring these itself.
<div class="jp">プレイヤーはインターフェースもシーンも持ちません。面には、コンストラクタに渡すコールバックを通して触れます。コールバックが復元するものはすべてログから来ます。`feed(points, done)`は、ペンが生んだのと同じ形で、ホストが配線したサイクルに点を渡します。`applyRecord(record)`は、点を流し込む前にひとつの記録のツールと色を戻します。`clear(background)`は面をログの背景に戻します。`resize(width, height)`（省略可）は、最初のクリアの前にログのキャンバスサイズを適用します。`canvas`はビデオのキャプチャ元の面です。`DrawingTool`はこれをひとつ内部に持ち、`player`として公開します。再生だけを行うページは、コールバックを自分で配線する代わりに、`PlaybackConfig`でエンジンをヘッドレスに使います。</div>

## The transport

`setData(data)` receives a log, replacing what it had. `play({ pointsPerFrame, strokeWaitMs, onDone })` animates from the current position, resting `strokeWaitMs` after each record marked `release`; `pause()` holds, keeping what is drawn, and `resume()` continues. `seek(index)` jumps so that many records are drawn; `next()` and `prev()` are one-step seeks, `rewind()` returns to the cleared background, and `finish()` jumps to the end. `position`, `length`, `playing`, and `recording` report the state, and `on(event, fn)` subscribes to `'step'`, `'play'`, `'pause'`, `'end'`, `'record-start'`, and `'record-end'`.
<div class="jp">`setData(data)`はログを受け取り、それまでのものを置き換えます。`play({ pointsPerFrame, strokeWaitMs, onDone })`は現在位置からアニメーションし、`release`の印が付いた記録のあとで`strokeWaitMs`だけ休みます。`pause()`は描かれたものを残したまま止まり、`resume()`は続きを再生します。`seek(index)`は、その数の記録が描かれた状態まで移動します。`next()`と`prev()`は1記録分のシーク、`rewind()`はクリアされた背景まで戻り、`finish()`は最後まで進めます。状態は`position`、`length`、`playing`、`recording`で確認でき、`on(event, fn)`で`'step'`、`'play'`、`'pause'`、`'end'`、`'record-start'`、`'record-end'`を購読できます。</div>

Seeking is rebuilt, not rewound: strokes are paint on a raster, and many read the canvas beneath them, so the frame at any position depends on every stroke before it. Moving backward clears to the log's background and re-feeds from the start; moving forward feeds only the difference. Each pass is stroke-level (whole paths, no animation and no idle time), so `finish` stays cheap. To only show the final frame, skip the player entirely and use the image from the tool's `snapshot()`.
<div class="jp">シークは巻き戻しではなく作り直しです。ストロークはラスタ上の絵の具であり、多くは自分の下のキャンバスを読むため、どの位置のフレームもそれ以前のすべてのストロークに依存します。後ろへ動くときは、ログの背景にクリアして最初から流し込み直し、前へ動くときは差分だけを流し込みます。どちらもストローク単位（パス全体を一度に、アニメーションも待ち時間もなし）なので、`finish`は軽いままです。最後のフレームを見せるだけなら、プレイヤーを使わずに、ツールの`snapshot()`の画像を使ってください。</div>

`record({ filename, onDone })` plays from the start while capturing the canvas and saves the video, mp4 where the browser can encode it, webm otherwise.
<div class="jp">`record({ filename, onDone })`は、キャンバスをキャプチャしながら最初から再生し、ビデオを保存します（ブラウザがエンコードできる場合はmp4、そうでなければwebm）。</div>

## Serialization

`serializeDrawing({ size, background, records })` returns the log as JSON, under `{ version: 2, size, background, records }`; `size` is the canvas in CSS pixels when recorded, and version 1 logs, which have none, still load. `downloadDrawingZip(log, filename)` saves it as a zip holding one JSON file, and `readDrawingZip(file)` reads it back from a zip or a bare JSON file. The zip codec loads on demand, so pages that never save or load pay nothing for it.
<div class="jp">`serializeDrawing({ size, background, records })`は、ログを`{ version: 2, size, background, records }`の形のJSONとして返します。`size`は記録時のキャンバスのCSSピクセルで、これを持たないバージョン1のログもそのまま読み込めます。`downloadDrawingZip(log, filename)`はそれをJSONファイルをひとつ持つzipとして保存し、`readDrawingZip(file)`はzipか素のJSONファイルから読み戻します。zipのコーデックは必要になったときに読み込まれるため、保存も読み込みもしないページには何のコストもかかりません。</div>

</div>
