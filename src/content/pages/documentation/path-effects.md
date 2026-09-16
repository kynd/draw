---
title: Path Effects
---

<div class="prose">

Generators that derive new paths from a base path. Each takes an array of control points and returns one or more new point arrays, ready to hand to a `StrokeDef`. They know nothing about renderers: the derived paths are ordinary paths, drawn by whatever renderer the caller picks.
<div class="jp">元のパスから新しいパスを導く生成器です。それぞれ制御点の配列を受け取り、`StrokeDef`にそのまま渡せる点の配列をひとつ以上返します。生成器はレンダラからは切り離されています。導かれたパスは通常のパスとして、呼び出し側が選んだレンダラで描かれます。</div>

<div class="page-note">
<p><code>public/lib/pathEffects.js</code></p>
</div>

All randomness is seeded, so the same seed returns the same paths.
<div class="jp">ランダム性はすべてシード付きで、同じシードからは同じパスが返ります。</div>

## spiralPath

The tip circles with sin and cos while its center moves along the base path, returning one continuous coil. The turn count comes from the path's length, one turn per `cycle` of arc, so every loop advances the same distance whatever the stroke's length. Takes `cycle`, `radius`, `turns` (overriding the cycle derivation), and `count` (output points, overriding the per-turn resolution).
<div class="jp">中心が元のパスに沿って進むあいだ、先端がsinとcosで円を描き、一本の連続したコイルを返します。回転数はパスの長さから決まり、弧長の`cycle`ごとに1回転するため、ストロークの長さによらず各ループは同じ距離だけ進みます。`cycle`、`radius`、`turns`（cycleからの導出を上書き）、`count`（1回転あたりの分解能を上書きする出力点数）を受け取ります。</div>

## wigglePath

One path crossing the base from side to side, its wavelength tightening from `cycleStart` at the beginning to `cycleEnd` at the end. The crossing count comes from the path's length, so the loose-to-tight sweep reads the same on a short stroke as on a long one. The offset runs along the base normal and eases to zero at both ends, so the mark leaves and returns to the drawn path. Takes `amplitude`, `cycleStart`, and `cycleEnd`.
<div class="jp">元のパスを左右に横切る一本のパスで、波長は始めの`cycleStart`から終わりの`cycleEnd`へと詰まっていきます。横切る回数はパスの長さから決まるため、ゆるいから詰まるへの移り変わりは、短いストロークでも長いストロークでも同じように読めます。オフセットは元のパスの法線方向に走り、両端でゼロに収まるため、マークは描いたパスから離れ、また戻ってきます。`amplitude`、`cycleStart`、`cycleEnd`を受け取ります。</div>

## entangledPaths

Copies of the path, each offset by its own seeded low-frequency waves. Endpoints pull back toward the base so the bundle reads as one gesture. The wave count per copy comes from the path's length, one wave per `wavelength` of arc, so a long stroke wiggles as often as a short one. Takes `count`, `amplitude`, `wavelength`, `waves`, and `seed`.
<div class="jp">パスの複製で、それぞれが独自のシード付き低周波の波でずらされます。端点は元のパスへ引き戻されるため、束全体がひとつの身振りに見えます。複製ごとの波の数はパスの長さから決まり、弧長の`wavelength`ごとに1波なので、長いストロークは短いものと同じ頻度で揺れます。`count`、`amplitude`、`wavelength`、`waves`、`seed`を受け取ります。</div>

## scatteredPaths

Short strokes that copy small segments of the base and move sideways by a seeded offset. The stroke count comes from the path's length, one per `spacing` of arc, so the scatter keeps its density as the stroke grows. Takes `spacing`, `length`, `offset`, and `seed`.
<div class="jp">元のパスの短い区間を写し取り、シード付きのオフセットで横へずらした短いストロークです。ストロークの本数はパスの長さから決まり、弧長の`spacing`ごとに1本なので、伸びても散らばりの密度を保ちます。`spacing`、`length`、`offset`、`seed`を受け取ります。</div>

## mirroredPath

The path mirrored across the vertical line through `x`, the horizontal line through `y`, or both (a point reflection). With neither given it mirrors across the vertical line through the path's own start. Pressures ride along, so a pen gesture mirrors with its dynamics.
<div class="jp">`x`を通る垂直線、`y`を通る水平線、またはその両方（点対称）に対して鏡映しにしたパスです。どちらも省略すると、パス自身の始点を通る垂直線になります。筆圧も一緒に写されるため、ペンの身振りは強弱ごと鏡映しになります。</div>

## rotatedPaths

`count - 1` copies of the path rotated evenly around `center`, the path's own start when omitted, so the path and its copies together divide the turn into `count`. Pressures ride along.
<div class="jp">`center`（省略するとパス自身の始点）の周りに均等に回転させた、`count - 1`個の複製です。元のパスと複製を合わせると、一周が`count`等分されます。筆圧も一緒に写されます。</div>

## convexHull

The convex hull of a set of points, counterclockwise, by Andrew's monotone chain. The hull is the smallest convex region containing every point.
<div class="jp">点の集合の凸包を、Andrewのmonotone chainで反時計回りに求めます。凸包は、すべての点を含む最小の凸領域です。</div>

## offsetOutline

The outline of everything within `radius` of the polyline: an offset of the path itself, so it follows the gesture into its concavities instead of spanning them. The distance field to the polyline is stamped onto a grid and the radius contour is extracted with marching squares. Returns the longest closed contour, counterclockwise. Takes `radius` and `cell`.
<div class="jp">ポリラインから`radius`以内にある領域全体の輪郭です。パスそのもののオフセットなので、身振りの凹みをまたがずに沿って進みます。ポリラインへの距離場をグリッドに書き込み、半径の等値線をmarching squaresで取り出します。最も長い閉じた輪郭を反時計回りで返します。`radius`と`cell`を受け取ります。</div>

## blobOutline

The full blob pipeline: a gesture in, a smooth closed contour out. The path is resampled to knots, closed into a smooth loop, offset by `radius`, and the contour smoothed again. Closing first keeps the result a mass rather than a tube, and the offset field does not care when the closure crosses the stroke. Takes `span` and `radius`.
<div class="jp">ブロブのパイプライン全体です。身振りを入れると、滑らかな閉じた輪郭が出てきます。パスはノットに再サンプリングされ、滑らかなループとして閉じられ、`radius`でオフセットされ、輪郭が再び滑らかにされます。先に閉じておくことで、結果はチューブではなくかたまりになります。閉じ目がストロークと交差しても、オフセットの距離場には影響しません。`span`と`radius`を受け取ります。</div>

## Shapes from endpoints

Contours placed and sized by a gesture's start and end alone; the path between them is ignored. Every generator returns a closed counterclockwise contour with its corners kept exactly, or null when the endpoints are too close to span a shape.
<div class="jp">身振りの始点と終点だけで位置と大きさが決まる輪郭です。その間のパスは無視されます。すべての生成器は、角をそのまま保った閉じた反時計回りの輪郭を返します。端点が近すぎて形にならないときはnullを返します。</div>

`circleFromEnds(a, b)` is a circle from center `a` to edge `b`. `ovalFromEnds(a, b)` is the axis-aligned ellipse inscribed in the box with diagonal `a`-`b`, and `rectFromEnds(a, b)` is that box itself. `diamondFromEnds(a, b)` is a rhombus with long diagonal `a`-`b`; `ratio` sets the short diagonal against it. `triangleFromEnds(a, b, { angles, seed })` stands a triangle on the edge `a`-`b` with the given interior angles; which corner takes which angle, and which side of the edge the apex lands on, derive from the seed.
<div class="jp">`circleFromEnds(a, b)`は中心`a`から縁`b`までの円です。`ovalFromEnds(a, b)`は対角線`a`-`b`の箱に内接する軸平行の楕円で、`rectFromEnds(a, b)`はその箱そのものです。`diamondFromEnds(a, b)`は長い対角線が`a`-`b`のひし形で、`ratio`が短い対角線の比を決めます。`triangleFromEnds(a, b, { angles, seed })`は、与えられた内角を持つ三角形を辺`a`-`b`の上に立てます。どの角にどの角度が割り当てられるか、頂点が辺のどちら側に立つかはシードから導かれます。</div>

</div>
