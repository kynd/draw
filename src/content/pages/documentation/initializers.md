---
title: Initializers
---

<div class="prose">

Compositions that fill a fresh canvas, so a drawing never starts from blank paper. Each initializer rolls a plan, plain data: a background spec and a list of marks, each naming a registry tool with its values, colors, width, and path in world units. A fill's radius rides its width (the contour is drawn at 1.3 times it), and the split initializer's color regions ride the background spec, so a recording reproduces them with its clear.
<div class="jp">まっさらなキャンバスを満たす構成です。描画が白紙から始まることはなくなります。それぞれのイニシャライザはプランをロールします。プランは素のデータで、背景の指定と筆跡のリストからなり、各筆跡はレジストリのツールを名前で指し、値、色、幅、ワールド座標のパスを持ちます。塗りの半径は幅に乗ります（輪郭は幅の1.3倍で描かれる）。分割イニシャライザの色の領域は背景の指定に乗るため、記録はクリアと一緒にそれを再現します。</div>

<div class="page-note">
<p><code>public/lib/demo/initializers.js</code></p>
</div>

Two executors run a plan. `runInitializer({ stage, board }, plan)` bakes it straight onto a board, for the initializer demos. The drawing tool runs one on every `clear`, picked at random from its config's `initializers` list and rolled from the page's own tool set, and feeds the marks through its cycle, so the result records, replays, and mirrors like anything drawn (the records carry `initial: true`, so a playback can place them instantly). The try-drawing demos use `['scatter']`, the default; the Drawing Tool Demo and the packaging layer pick from all four.
<div class="jp">プランを実行するものは2つあります。`runInitializer({ stage, board }, plan)`はプランをそのままボードに焼き込みます（イニシャライザのデモ用）。描画ツールは`clear`のたびに、設定の`initializers`リストからランダムにひとつを選び、そのページのツールの集合からロールして、筆跡をサイクルに流します。そのため結果は描いたものと同じように記録され、再生され、ミラーされます（記録は`initial: true`を持つため、再生は一瞬で置けます）。Try drawingのデモは既定の`['scatter']`を使い、Drawing Tool Demoとパッケージング層は4つすべてから選びます。</div>

Rolling uses Math.random; a host that needs determinism records what the marks drew. Where a roll's preferred tool kind is missing from the page's set, any tool stands in.
<div class="jp">ロールはMath.randomを使います。決定性が必要なホストは、筆跡が描いたものを記録します。ロールが求めるツールの種類がページの集合にないときは、任意のツールが代わりに立ちます。</div>

## The initializers

<ul>
<li><code>scatterInit</code> — the drawing tool's own start: a paper gradient and one to four strokes scattered with random stroke tools and palette colors, the first one long.<br /><span class="jp">描画ツール自身のスタート。紙のグラデーションと、ランダムなストロークのツールとパレットの色で散らされた1本から4本のストローク。最初の1本は長く走ります。</span></li>
<li><code>patternInit</code> — a random stroke tool draws one narrow-lined composition in two alternating palette colors (stripes at a random angle, a grid, or wave rows), with even odds of a second composition overlapping the first.<br /><span class="jp">ランダムなストロークのツールが、2つのパレットの色を交互に使って細い線のひとつの構成を描きます（ランダムな角度のストライプ、グリッド、または波の列）。五分五分の確率で、2つめの構成が最初の構成に重なります。</span></li>
<li><code>splitInit</code> — the canvas divided by a random straight line, each part divided again at even odds a few levels deep, every region filled with a flat palette color, and one to four random strokes on top. The division is a half-plane clip of the region's polygon through a point near its centroid.<br /><span class="jp">キャンバスをランダムな直線で分割し、分かれた各領域を五分五分の確率でさらに分割します（数レベルまで）。各領域はパレットから平坦な色を取り、最後にランダムなストロークが1本から4本乗ります。分割は、領域のポリゴンを重心近くの点を通る半平面で切り取ることで行います。</span></li>
<li><code>fillsInit</code> — one to three very big fills with random fill tools; each fill's spine runs from a point past one edge into the far half of the canvas, so it always crosses the midline without having to cover the center.<br /><span class="jp">ランダムな塗りのツールによる、1つから3つのとても大きな塗り。それぞれの塗りの芯はひとつの縁の先からキャンバスの反対側の半分まで走るため、塗りはつねに中心線を越えますが、中心を覆うとは限りません。</span></li>
</ul>

## The demo harness

`setupInitializerDemo(initialize)` is what the initializer demos share: a stage, a board, and the corner button that runs the initializer again with a fresh palette and theme.
<div class="jp">`setupInitializerDemo(initialize)`はイニシャライザのデモが共有する部分です。ステージ、ボード、そして新しいパレットとテーマでイニシャライザをもう一度実行する、角のボタン。</div>

</div>
