---
title: Player
---

<div class="prose">

Recording and playback for drawings. A drawing's log is data, not raster: the starting background and one record per committed mark. `StrokeRecorder` collects the log while drawing, and `StrokePlayer` is the standalone engine that receives a log and plays it through a draw cycle, records the playback to a video, and serializes the log to and from a file.
<div class="jp">描画の記録と再生です。描画のログはラスタではなくデータです。開始時の背景と、確定した印ごとの記録からなります。`StrokeRecorder`は描いている間にログを集めます。`StrokePlayer`は独立したエンジンで、ログを受け取って描画サイクルを通して再生し、再生をビデオに録画し、ログをファイルとの間で直列化します。</div>

<div class="page-note">
<p><code>public/lib/demo/strokeRecorder.js</code>, <code>public/lib/demo/strokePlayer.js</code></p>
</div>

## The record

A record carries everything needed to rebuild one mark: `toolId`, the parameter `values`, `widthPx`, `sens`, `colorA`, `colorB`, `colors`, `seed`, and the drawn `points` with their pressures. Only drawn points are stored, so blank time costs nothing and a playback skips it by construction. The `toolId` names an entry in a registry, so the log stays valid as long as the ids do.
<div class="jp">記録は、ひとつの印を作り直すのに必要なすべてを運びます。`toolId`、パラメータの`values`、`widthPx`、`sens`、`colorA`、`colorB`、`colors`、`seed`、そして筆圧付きの描かれた`points`です。保存されるのは描かれた点だけなので、何もしていない時間のコストはなく、再生は構造上それをスキップします。`toolId`はレジストリのエントリを指すため、idが変わらない限りログは有効です。</div>

## StrokeRecorder

`begin(background)` starts a new take, as a clear does, storing the background spec (a color or a gradient description). `add(record, points)` appends one committed mark, copying the points as plain `{ x, y, pressure }`. The recorder's `{ background, records }` is the log.
<div class="jp">`begin(background)`は、クリアと同じように新しいテイクを始め、背景の指定（色かグラデーションの記述）を保存します。`add(record, points)`は確定した印をひとつ追加し、点を素の`{ x, y, pressure }`としてコピーします。レコーダーの`{ background, records }`がログです。</div>

`replayRecords({ records, applyTool, feed, pointsPerFrame, onDone })` is the low-level playback loop: it feeds each record's points a few per frame, calling `applyTool(record)` before a record's first points. The returned `finish` stops the animation and jumps straight to the end state, committing every remaining record at once; `onDone` still fires.
<div class="jp">`replayRecords({ records, applyTool, feed, pointsPerFrame, onDone })`は低レベルの再生ループです。各記録の点を1フレームに数点ずつ流し込み、記録の最初の点の前に`applyTool(record)`を呼びます。返される`finish`はアニメーションを止めて最終状態まで一気に進み、残りのすべての記録を一度に確定します。`onDone`はそれでも呼ばれます。</div>

## StrokePlayer

The engine owns no interface. It reaches the surface through three callbacks given to the constructor: `feed` (a draw cycle's feed), `applyRecord` (restores one record's tool and colors), and `clear` (clears the surface to a background spec); `canvas` is captured for the video.
<div class="jp">エンジンはインターフェースを持ちません。コンストラクタに渡される3つのコールバック、`feed`（描画サイクルのfeed）、`applyRecord`（ひとつの記録のツールと色を戻す）、`clear`（背景の指定へ面をクリアする）を通して面に届きます。`canvas`はビデオのためにキャプチャされます。</div>

`setData({ background, records })` receives a log, replacing what it had. `play({ pointsPerFrame, onDone })` clears to the background and plays the records, returning whether playback started; `finish()` jumps a running playback to the end state. `record({ filename, onDone })` plays while capturing the canvas and saves the video, mp4 where the browser can encode it, webm otherwise. `hasData`, `playing`, and `recording` report the state.
<div class="jp">`setData({ background, records })`はログを受け取り、それまでのものを置き換えます。`play({ pointsPerFrame, onDone })`は背景へクリアして記録を再生し、再生が始まったかどうかを返します。`finish()`は実行中の再生を最終状態まで進めます。`record({ filename, onDone })`はキャンバスをキャプチャしながら再生し、ビデオを保存します（ブラウザがエンコードできる場合はmp4、そうでなければwebm）。`hasData`、`playing`、`recording`が状態を報告します。</div>

## Serialization

`serializeDrawing({ background, records })` returns the log as JSON, under `{ version: 1, background, records }`. `downloadDrawingZip(log, filename)` saves it as a zip holding one JSON file, and `readDrawingZip(file)` reads it back from a zip or a bare JSON file. The zip codec loads on demand, so pages that never save or load pay nothing for it.
<div class="jp">`serializeDrawing({ background, records })`は、ログを`{ version: 1, background, records }`の形のJSONとして返します。`downloadDrawingZip(log, filename)`はそれをJSONファイルをひとつ持つzipとして保存し、`readDrawingZip(file)`はzipか素のJSONファイルから読み戻します。zipのコーデックは必要になったときに読み込まれるため、保存も読み込みもしないページは何のコストも払いません。</div>

</div>
