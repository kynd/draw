---
title: Initializers
---

<div class="prose">

Compositions that fill a fresh canvas, so a drawing never starts from blank paper. Each initializer is one function taking `{ stage, board, palette }`: it clears the board to a paper gradient (`paperGradient` on the Palette page) and bakes its composition, rolling everything else (tools, colors, placement) itself. The tools come from the master registry, so every stroke and fill an initializer lays down is one the drawing tool can draw.
<div class="jp">まっさらなキャンバスを満たす構成です。描画が白紙から始まることはなくなります。それぞれのイニシャライザは`{ stage, board, palette }`を受け取るひとつの関数です。ボードを紙のグラデーション（Paletteページの`paperGradient`）にクリアし、構成を焼き込みます。ツール、色、配置は自分でロールします。ツールはマスターレジストリから取られるため、イニシャライザが置くストロークと塗りはすべて、描画ツールが描けるものです。</div>

<div class="page-note">
<p><code>public/lib/demo/initializers.js</code></p>
</div>

Placement uses Math.random, like the scatter it grew from; a host that needs determinism records what the strokes drew.
<div class="jp">配置はMath.randomを使います（元になったスキャッタと同じです）。決定性が必要なホストは、ストロークが描いたものを記録します。</div>

## The initializers

<ul>
<li><code>scatterInit</code> — the drawing tool's own start: a paper gradient and one to four strokes scattered with random stroke tools and palette colors, the first one long.<br /><span class="jp">描画ツール自身のスタート。紙のグラデーションと、ランダムなストロークのツールとパレットの色で散らされた1本から4本のストローク。最初の1本は長く走ります。</span></li>
<li><code>patternInit</code> — a random stroke tool draws one narrow-lined composition in two alternating palette colors (stripes at a random angle, a grid, or wave rows), with even odds of a second composition overlapping the first.<br /><span class="jp">ランダムなストロークのツールが、2つのパレットの色を交互に使って細い線のひとつの構成を描きます（ランダムな角度のストライプ、グリッド、または波の列）。五分五分の確率で、2つめの構成が最初の構成に重なります。</span></li>
<li><code>splitInit</code> — the canvas divided by a random straight line, each part divided again at even odds a few levels deep, every region filled with a flat palette color, and one to four random strokes on top. The division is a half-plane clip of the region's polygon through a point near its centroid.<br /><span class="jp">キャンバスをランダムな直線で分割し、分かれた各領域を五分五分の確率でさらに分割します（数レベルまで）。各領域はパレットから平坦な色を取り、最後にランダムなストロークが1本から4本乗ります。分割は、領域のポリゴンを重心近くの点を通る半平面で切り取ることで行います。</span></li>
<li><code>fillsInit</code> — one to three very big fills with random fill tools; each fill's spine runs from the canvas center to a point past a random edge, so it always covers the center and reaches beyond at least one edge.<br /><span class="jp">ランダムな塗りのツールによる、1つから3つのとても大きな塗り。それぞれの塗りの芯はキャンバスの中心からランダムな縁の先まで走るため、塗りはつねに中心を覆い、少なくともひとつの縁を越えます。</span></li>
</ul>

## The demo harness

`setupInitializerDemo(initialize)` is what the initializer demos share: a stage, a board, and the corner button that runs the initializer again with a fresh palette and theme.
<div class="jp">`setupInitializerDemo(initialize)`はイニシャライザのデモが共有する部分です。ステージ、ボード、そして新しいパレットとテーマでイニシャライザをもう一度実行する、角のボタン。</div>

</div>
