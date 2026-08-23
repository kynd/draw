---
title: Renderers
---

<div class="monologue">
Swap one field and the same path becomes a different kind of mark.
<div class="jp">フィールドを一つ差し替えるだけで、同じパスが別の種類の線になります。</div>
</div>

<div class="prose">

<div class="page-note">
<p><code>public/lib/renderers/</code></p>
</div>

## The base class

A renderer turns a <a href="/draw/documentation/stroke-definition">`StrokeDef`</a> into a `THREE.Object3D`. One renderer instance can build any number of strokes — it carries style, never state about a particular stroke. That is why the renderer sits on the definition as a reference rather than being constructed per stroke.
<div class="jp">レンダラは <a href="/draw/documentation/stroke-definition">`StrokeDef`</a> を `THREE.Object3D` に変換します。レンダラのインスタンスは任意の数のストロークを構築できます。保持するのはスタイルであって、特定のストロークの状態ではありません。だからこそ、レンダラはストロークごとに生成されるのではなく、定義側から参照として保持されます。</div>

`StrokeRenderer` is the base class. Subclasses implement `build(def)`; `dispose(object)` is inherited and releases the geometry and materials of anything the renderer built. `resampleSpine(def, samplesPerUnit)` is exported alongside it and does the shared resampling, so tessellation behaves identically across the group rather than being reimplemented per renderer.
<div class="jp">`StrokeRenderer` が基底クラスです。サブクラスは `build(def)` を実装します。`dispose(object)` は継承され、そのレンダラが構築したもののジオメトリとマテリアルを解放します。`resampleSpine(def, samplesPerUnit)` も併せてエクスポートされ、共通の再サンプリングを担います。これにより、テセレーションの挙動はレンダラごとに再実装されるのではなく、グループ全体で同一になります。</div>

## Common to every renderer

These hold for all renderers in `public/lib/renderers/`. A new renderer is checked against this list before it joins the group; if it cannot honour an item, the contract changes deliberately and every existing renderer changes with it.
<div class="jp">以下は `public/lib/renderers/` にあるすべてのレンダラに当てはまります。新しいレンダラは、このグループに加わる前にこのリストと照合されます。いずれかを満たせない場合は、契約そのものを意図的に変更し、既存のすべてのレンダラもそれに合わせて変更します。</div>

### Adaptive sampling

The number of spine samples is proportional to arc length, not to the control point count: `clamp(round(length × samplesPerUnit), 8, 2048)`. A short stroke costs few triangles; a long one keeps the same visual smoothness instead of stretching a fixed budget over more distance. `samplesPerUnit` is exposed on each renderer so a demo can trade quality against cost at runtime.
<div class="jp">スパインのサンプル数は、制御点の数ではなく弧長に比例します。`clamp(round(length × samplesPerUnit), 8, 2048)`。短いストロークは少ない三角形で済み、長いストロークは固定の予算を引き伸ばすのではなく、同じ滑らかさを保ちます。`samplesPerUnit` は各レンダラで公開されており、デモは実行時に品質とコストを調整できます。</div>

Sampling is by arc length (`getSpacedPoints`), so vertex density is uniform along the mark. Clustered control points do not produce clustered geometry.
<div class="jp">サンプリングは弧長基準（`getSpacedPoints`）で行うため、頂点の密度は線に沿って一様になります。制御点が密集していても、ジオメトリが密集することはありません。</div>

### 2D framing

The normal is the +90° rotation of the tangent in the XY plane. The tangent's Z component is **dropped before framing**.
<div class="jp">法線は、XY平面上で接線を+90°回転させたものです。フレームを構築する前に、接線のZ成分は<strong>捨てられます</strong>。</div>

This matters because of how depth is used. A 2D stroke ramps its Z very slightly from start to end so that where it crosses itself, the later section sits over the earlier one. That ramp is ordering information, not shape — if it were fed into the frame, the ribbon would twist out of the plane by exactly as much as the ordering trick required. Dropping Z keeps the mark flat and camera-facing while the ordering still works.
<div class="jp">これは、深度の使い方に関わる重要な点です。2Dのストロークは、始点から終点にかけてZをごくわずかに上昇させます。こうすることで、自分自身と交差する箇所では、後から描かれた部分が先に描かれた部分の上に来ます。この傾斜は順序の情報であって、形状ではありません。もしこれをフレームの計算に入れてしまうと、リボンは順序付けに必要だった分だけ平面から捻れてしまいます。Zを捨てることで、順序付けは機能したまま、線は平面を保ち、カメラを正面から向き続けます。</div>

<div class="page-note">
<p>Use an orthographic camera for 2D work. Depth is linear under orthographic projection, so offsets in the range of thousandths resolve exactly — no Z-fighting, and no need for <code>polygonOffset</code>.</p>
<span class="jp">2Dの作業では正射影カメラを使ってください。正射影では深度が線形になるため、1000分の1程度のオフセットでも正確に解決されます。Zファイティングは起きず、<code>polygonOffset</code> も不要です。</span>
<p>The ramp decides crossings even when nothing looks different: with a flat opaque fill both outcomes render identically. Its job is to make the answer <strong>determined</strong> before the fill stops being flat and opaque.</p>
<span class="jp">この傾斜は、見た目に違いが出ない場合でも交差の順序を決めています。不透明な単色の塗りでは、どちらの結果も同じに描画されるからです。その役割は、塗りが単色・不透明でなくなる前に、答えを<strong>確定</strong>させておくことです。</span>

### Independent left and right width

Offsets always come from `widthLeftAt(t)` and `widthRightAt(t)` separately. No renderer assumes symmetry, including in its caps and joins.
<div class="jp">オフセットは常に `widthLeftAt(t)` と `widthRightAt(t)` から別々に取得します。どのレンダラも、端点や継ぎ目を含めて、左右対称であることを前提にしません。</div>

### UV convention

`u` runs 0 → 1 along the stroke by arc length. `v` runs 0 on the left edge to 1 on the right. Caps continue the same frame: `u` is 0 across the whole start cap and 1 across the whole end cap, while `v` sweeps 0 → 1 from the left offset round to the right.
<div class="jp">`u` は弧長に沿って 0 から 1 へ進みます。`v` は左端の 0 から右端の 1 へ進みます。端点も同じフレームを引き継ぎ、始点側の端点全体で `u` は 0、終点側の端点全体で `u` は 1 となり、その間 `v` は左のオフセットから右のオフセットへ 0 から 1 へと掃引されます。</div>

Holding this convention across the group means a texture, gradient, or shader written for one renderer keeps its meaning under another.
<div class="jp">この規約をグループ全体で守ることで、あるレンダラ向けに書いたテクスチャやグラデーション、シェーダが、別のレンダラでも同じ意味を保ちます。</div>

### Reported stats

The returned object carries `userData.samples` (the resampled spine positions) and `userData.stats` with `sampleCount`, `vertexCount`, `triangleCount`, and `length`. Demos use these to show what the tessellation is actually doing rather than asserting it in prose.
<div class="jp">返されるオブジェクトは `userData.samples`（再サンプリングされたスパインの座標）と、`sampleCount`、`vertexCount`、`triangleCount`、`length` を含む `userData.stats` を保持します。デモはこれを使って、テセレーションが実際に何をしているかを、文章で主張するのではなく表示します。</div>

## RibbonStrokeRenderer

A flat ribbon along the spine, closed at both ends by one of three caps. Two triangles per segment, plus whatever the cap adds.
<div class="jp">スパインに沿った平らなリボンを、3種類のいずれかの端点で閉じます。セグメントごとに2つの三角形と、端点が追加する分の三角形で構成されます。</div>

The body is identical whichever cap is chosen. That is why the cap is an option on one renderer rather than three renderers repeating the ribbon build.
<div class="jp">どの端点を選んでも本体は同じです。だからこそ端点は、リボン生成を3度繰り返す3つのレンダラではなく、ひとつのレンダラのオプションになっています。</div>

<div class="page-note">
<ul>
<li><code>cap</code> — <code>'rounded'</code>, <code>'square'</code>, or <code>'ragged'</code>. Default <code>'rounded'</code>.<br /><span class="jp"><code>'rounded'</code>、<code>'square'</code>、<code>'ragged'</code> のいずれか。既定値は <code>'rounded'</code>。</span></li>
<li><code>color</code> — fill color, or the start color when <code>gradient</code> is set. Default <code>'#1a1a1a'</code>.<br /><span class="jp">塗りの色。<code>gradient</code> を指定した場合は始点側の色になります。既定値は <code>'#1a1a1a'</code>。</span></li>
<li><code>gradient</code> — optional end color. When set, the fill interpolates from <code>color</code> to it along <code>u</code>, written as a vertex color attribute. Default <code>null</code> (flat).<br /><span class="jp">終点側の色（省略可）。指定すると、塗りが <code>u</code> に沿って <code>color</code> からこの色へ補間され、頂点カラー属性として書き込まれます。既定値は <code>null</code>（単色）。</span></li>
<li><code>opacity</code> — below 1 switches the material to transparent. Default <code>1</code>.<br /><span class="jp">1未満にするとマテリアルが半透明になります。既定値は <code>1</code>。</span></li>
<li><code>samplesPerUnit</code> — spine samples per world unit of arc length. Default <code>120</code>.<br /><span class="jp">弧長1ワールド単位あたりのスパインのサンプル数。既定値は <code>120</code>。</span></li>
<li><code>capSegmentsPerUnit</code> — rounded-cap arc segments per world unit of radius, clamped to 6 through 32. Default <code>260</code>.<br /><span class="jp">roundedの端点における、半径1ワールド単位あたりの円弧の分割数。6〜32に制限されます。既定値は <code>260</code>。</span></li>
</ul>
</div>

### Square, rounded, ragged

#### Square

The ribbon stops at its last sample and no cap geometry is added.
<div class="jp">リボンは最後のサンプルで終わり、端点のジオメトリは追加されません。</div>

#### Rounded

A triangle fan centered on the last spine point, sweeping from the left offset point, round through the outward tangent, to the right offset point:
<div class="jp">スパインの端の点を中心とするトライアングルファンで、左のオフセット点から、外向きの接線を通って、右のオフセット点まで掃引されます。</div>

<div class="page-note">
<p><code>d(φ) = n·cos φ ± t·sin φ</code><br />
<code>r(φ) = wL + (wR − wL)·φ/π</code></p>
</div>

φ runs 0 to π, with the sign negative at the start cap and positive at the end. At φ=0 the fan point lands exactly on the left ribbon edge with radius wL, and at φ=π on the right edge with radius wR, so the cap and the ribbon share an edge with no seam.
<div class="jp">φは0からπまで進み、符号は始点側で負、終点側で正になります。φ=0のとき、ファンの点は半径wLでリボンの左端にちょうど乗り、φ=πのときは半径wRで右端に乗ります。したがって端点とリボンは継ぎ目なく辺を共有します。</div>

Interpolating the radius rather than using a fixed one is what makes an asymmetric stroke end correctly. A circle of radius max(wL, wR) would overshoot the narrow side and a circle of radius min(wL, wR) would cut into the wide one. The interpolated sweep is a half-ellipse that meets both edges.
<div class="jp">半径を固定せず補間することが、左右非対称なストロークを正しく終端させる鍵です。半径max(wL, wR)の円は細い側にはみ出し、半径min(wL, wR)の円は太い側を削ってしまいます。補間された掃引は、両方の端に接する半楕円になります。</div>

Cap resolution scales with radius, so a hairline does not pay for 32 triangles it cannot show and a broad mark does not end in a visible polygon. The lower clamp at 6 keeps very thin strokes from degenerating into a wedge.
<div class="jp">端点の分割数は半径に応じて増減します。髪の毛ほどの細い線が、見えもしない32個の三角形の代償を払うことはなく、太い線が目に見える多角形で終わることもありません。下限の6は、非常に細いストロークが楔形に潰れるのを防ぎます。</div>

#### Ragged

A quad strip from the ribbon's end edge out to a torn outer edge, 20 segments wide. The inner row sits on the end edge so the cap seals against the body. The outer row is pushed past the end by a per-vertex depth between 0.05 and 1 times the average half-width.
<div class="jp">リボンの終端の辺から、裂けた外側の辺までを結ぶ20分割のクアッドストリップです。内側の列は終端の辺の上に置かれ、端点が本体と隙間なくつながります。外側の列は、平均の半幅の0.05倍から1倍までの、頂点ごとの深さで終端の先へ押し出されます。</div>

The depth comes from two sine samples of the vertex index offset by the stroke's `seed`, not from `Math.random`. The same seed always tears the same way, so rebuilding at a different density or color redraws the identical end. The two caps of one stroke use the seed scaled differently, so a stroke does not end symmetrically.
<div class="jp">深さは `Math.random` ではなく、頂点インデックスをストロークの `seed` でずらした2つの正弦波のサンプルから求めます。同じシードからは常に同じ裂け方が得られるため、Densityや色を変えて作り直しても、終端は同じ形で描き直されます。1本のストロークの両端はシードに異なる倍率を掛けて使うため、両端が対称になることはありません。</div>

### Shading along the stroke

Setting `gradient` interpolates the fill from `color` to `gradient` across `u`. Because `u` is the arc-length parameter defined by the UV convention, the shading follows the drawn order of the mark, and caps take the color of the end they close. A cap holds `u` constant across its whole fan or strip.
<div class="jp">`gradient` を指定すると、塗りが `u` に沿って `color` から `gradient` へ補間されます。`u` はUV規約で定義された弧長のパラメータなので、陰影は線が描かれた順序に従います。端点は、それが閉じている側の色を取ります。端点はファンやストリップ全体で `u` が一定だからです。</div>

### Not yet handled

Self-intersection at sharp turns. Where the curvature radius drops below the local width, the two ribbon edges cross and the mark folds back on itself. This is not hypothetical. A path with a cusp, where speed passes through zero, folds into a visible notch every time. Nothing in the renderer detects it, so for now it is a constraint on the paths handed in rather than something the renderer absorbs.
<div class="jp">急な曲がりでの自己交差。曲率半径が局所的な幅を下回る箇所では、リボンの両端が交差し、線が自分の上に折り返します。これは仮定の話ではありません。速度がゼロを通過するカスプを持つパスは、必ず目に見える切れ込みとなって折れます。レンダラ側にこれを検出する仕組みはないため、当面はレンダラが吸収する問題ではなく、渡されるパスの側への制約ということになります。</div>

## ShaderStrokeRenderer

Base for renderers that shade the ribbon with their own fragment shader. Two things separate it from `RibbonStrokeRenderer`. The geometry can be built wider than the mark it draws, and the shader is given enough information to find the visual edge inside that margin.
<div class="jp">独自のフラグメントシェーダでリボンを陰影付けするレンダラの基底クラスです。`RibbonStrokeRenderer` との違いは2点あります。ジオメトリを描く線より広く作れることと、その余白のどこに視覚的な輪郭があるかをシェーダが知れることです。</div>

Effects that reach past the stroke, a watercolor bleed or a dragged smear, need somewhere to land, and a fragment can only be shaded where a triangle covers it.
<div class="jp">にじみや引きずりのようにストロークの外へ届く効果には受け皿が必要で、フラグメントは三角形が覆う場所でしか陰影を計算できないからです。</div>

<div class="page-note">
<p>Every subclass shader receives:</p>
<ul>
<li><code>vUv</code> — u along the stroke by arc length, v across the inflated width.<br /><span class="jp">uは弧長に沿った位置、vは広げた幅を横断する位置。</span></li>
<li><code>vCross</code> — signed distance across the width in visual-edge units. <code>|vCross| &lt;= 1</code> is inside the mark.<br /><span class="jp">視覚的な輪郭を1とする符号付きの幅方向の距離。<code>|vCross| &lt;= 1</code> が線の内側です。</span></li>
<li><code>vTangent</code>, <code>vWorld</code> — unit tangent and world position.<br /><span class="jp">単位接線とワールド座標。</span></li>
<li><code>screenUv()</code> — the fragment's position in the frame, for reading the background.<br /><span class="jp">背景を読むための、フレーム内でのフラグメントの位置。</span></li>
<li><code>tangentUv()</code> — the stroke's own direction as a unit step in screen UV space.<br /><span class="jp">画面UV空間での、ストローク自身の向きの単位ステップ。</span></li>
<li><code>uSeed</code>, <code>uLength</code>, <code>uWidth</code>, plus <code>fbm</code> and hash helpers.<br /><span class="jp">シード、弧長、幅に加え、<code>fbm</code> とハッシュの補助関数。</span></li>
</ul>
</div>

## BrushStrokeRenderer

Bristle streaks along the mark, an eroded edge, and dry patches where the brush ran out. The stroke carries two colors rather than one.
<div class="jp">線に沿った毛の筋、削られた輪郭、そして筆の絵の具が切れた箇所のかすれ。このストロークは1色ではなく2色を持ちます。</div>

One noise field draws the bristles, pushes the edge, and decides which pigment shows. Separate fields would let the streaks, the edge and the color disagree, and the mark would stop reading as one gesture.
<div class="jp">ひとつのノイズが、毛の筋を描き、輪郭を押し、どちらの顔料が出るかを決めます。別々のノイズでは、筋と輪郭と色が食い違い、線はひとつの身振りとして読めなくなります。</div>

<div class="page-note">
<ul>
<li><code>colorA</code> / <code>colorB</code> — the two pigments.<br /><span class="jp">2つの顔料。</span></li>
<li><code>bristles</code> — lanes across the width. Default <code>26</code>.<br /><span class="jp">幅方向のレーン数。既定値は <code>26</code>。</span></li>
<li><code>streak</code> — how far lanes stretch along the mark. Default <code>5.0</code>.<br /><span class="jp">レーンが線に沿って伸びる長さ。既定値は <code>5.0</code>。</span></li>
<li><code>rough</code> — edge erosion depth. Default <code>0.35</code>.<br /><span class="jp">輪郭の削れの深さ。既定値は <code>0.35</code>。</span></li>
<li><code>dry</code> — how much of the mark drops out. Default <code>0.30</code>.<br /><span class="jp">線が抜け落ちる量。既定値は <code>0.30</code>。</span></li>
</ul>
</div>

## Background samplers

Three renderers that read what is underneath and move it. All take a `background` texture and sample it by screen position, because a stroke does not know what is under it and asking in pixels is the only question that has an answer.
<div class="jp">下にあるものを読み、それを動かす3つのレンダラです。いずれも `background` テクスチャを受け取り、画面上の位置で参照します。ストロークは自分の下に何があるかを知らないため、ピクセルで問うことだけが答えを持つからです。</div>

### WatercolorStrokeRenderer

Reads a pre-blurred copy of the background rather than gathering a neighbourhood per fragment. A thirty pixel radius costs hundreds of taps on every covered fragment, while the same result is one texel read against a copy blurred once for the whole frame.
<div class="jp">フラグメントごとに周辺を集めるのではなく、あらかじめぼかした背景のコピーを読みます。半径30ピクセルなら覆われた全フラグメントで数百回のサンプリングが必要ですが、同じ結果はフレーム全体で一度ぼかしたコピーを1テクセル読むだけで得られます。</div>

Takes `blurred` alongside `background`, plus `pigment`, `rim`, `granulation` and `edge`. The rim darkens just inside the boundary, where water dries back and leaves pigment.
<div class="jp">`background` に加えて `blurred` を受け取り、さらに `pigment`、`rim`、`granulation`、`edge` を取ります。rimは輪郭のすぐ内側を濃くします。水が引きながら乾き、そこに顔料を残すからです。</div>

### SmearStrokeRenderer

Walks backward along the stroke's own direction in screen space and averages what it finds, so the background is streaked the way the mark travelled. `drag` sets the reach in pixels and `variation` how much it differs from lane to lane.
<div class="jp">画面上でストローク自身の向きに沿って後方へ歩き、そこで見つけたものを平均するため、背景は線が進んだ方向に筋を引きます。`drag` は届く距離をピクセルで、`variation` はレーンごとの差を決めます。</div>

The variation is what stops the result reading as motion blur. A real brush drags hard under some bristles and barely at all under others.
<div class="jp">この変化があるからこそ、結果がモーションブラーに見えません。実際の筆は、ある毛の下では強く引きずり、別の毛の下ではほとんど引きずらないからです。</div>

### WetBrushStrokeRenderer

The drag runs first, over a mix of the sharp and softened background set by `wet`, and the wash then tints what the drag produced. Blending two finished results would wash out the streaks, because an even blur and a directional smear cancel each other where they disagree.
<div class="jp">まず引きずりが、`wet` で決まる鮮明な背景とぼかした背景の混合の上で走り、そのあとで水彩がその結果を染めます。仕上がった2つの結果を混ぜると筋は消えます。一様なぼかしと方向を持つ引きずりは、食い違う場所で互いを打ち消すからです。</div>

## Height field materials

`HeightFieldStrokeRenderer` gives the mark a height built from distance to the edge, which rounds the cross-section into a bead, and noise stretched along the path, which reads as liquid dragged by the brush. Subclasses shade the resulting normal.
<div class="jp">`HeightFieldStrokeRenderer` は、輪郭からの距離（断面を丸い盛り上がりにする）と、パスに沿って引き伸ばされたノイズ（筆で引きずられた液体に見える）から、線に高さを与えます。サブクラスはその法線を使って陰影を付けます。</div>

<div class="page-note">
<p>The bead is parabolic, not a hemisphere. A hemisphere's slope runs to infinity at the rim, which turns every fragment near the edge into noise once a finite difference is taken across it.</p>
<span class="jp">盛り上がりは半球ではなく放物線です。半球は縁で傾きが無限大に発散し、そこで差分を取ると輪郭付近のフラグメントはすべてノイズになります。</span>
<p>Height is measured in units of the half-width, and so is the across coordinate, so the gradient is dimensionless and needs no correction factor at any width.</p>
<span class="jp">高さは半幅を単位として測られ、幅方向の座標も同じ単位です。そのため勾配は無次元となり、どの太さでも補正係数が不要です。</span>
<p>Normals come from finite differences in the stroke's own frame, not from <code>dFdx</code>. Screen-space derivatives break down along the silhouette, which is exactly where the bead turns over fastest.</p>
<span class="jp">法線は <code>dFdx</code> ではなく、ストローク自身の座標系での差分から求めます。画面空間の微分は輪郭沿いで破綻しますが、そこはまさに盛り上がりが最も急に折り返す場所です。</span>
</div>

### ChromeStrokeRenderer

An assumed environment of two tones split at a horizon. A mirror shows mostly a bright sky and a dark ground, and the eye reads the boundary sweeping across a curved surface as metal.
<div class="jp">地平線で分かれた2つの色調からなる、仮定された環境です。鏡に映るのはおおむね明るい空と暗い地面であり、曲面をその境界が走っていくのを、目は金属として読み取ります。</div>

### MirrorStrokeRenderer

The reflected direction is used as a screen-space offset into the background rather than as a ray into a cube map. It is not a correct reflection and cannot show anything outside the frame, but for a flat mark lying on a surface the difference is invisible. `contrast` is pushed after sampling, since a mirror does not return a muted copy.
<div class="jp">反射方向は、キューブマップへのレイではなく、背景への画面空間のオフセットとして使われます。正しい反射ではなく、フレームの外は映せませんが、面の上に横たわる平らな線ではその違いは見えません。サンプリング後に `contrast` を強めます。鏡は彩度を落とした複製を返すわけではないからです。</div>

### GlassStrokeRenderer

Refraction offsets the lookup along the normal, so the bead acts as a lens and displaces most where it tilts hardest. Reflection is mixed in by a Fresnel term, which is what stops the result reading as a smudge.
<div class="jp">屈折は参照位置を法線方向にずらすため、盛り上がりはレンズとして働き、最も傾く場所でずれが最大になります。反射はフレネル項で混ぜられ、これがあるからこそ結果が汚れに見えずに済みます。</div>

## Geometry renderers

Three renderers that keep the path, the width and the resampling and throw away the ribbon. The same `StrokeDef` drives all of them.
<div class="jp">パス、幅、再サンプリングを保ったまま、リボンだけを捨てる3つのレンダラです。同じ `StrokeDef` がそのすべてを駆動します。</div>

All three place colors with a seeded generator rather than `Math.random`. A drawing that looks random has to redraw identically, or a change to one control could never be compared against the frame before it.
<div class="jp">3つとも、色の配置に `Math.random` ではなくシード付きの生成器を使います。ランダムに見える絵は同じ結果で描き直せなければ、あるコントロールを変えた結果を直前のフレームと比べられません。</div>

### PixelStrokeRenderer

Square cells on a fixed grid, stamped from the spine outward rather than tested from a grid inward. A grid over the bounding box would test far more empty cells than filled ones for a thin diagonal mark. A Set keyed by grid coordinate keeps overlapping stamps from emitting a cell twice. `cell` sets the size and `jitter` the chance a reachable cell is dropped.
<div class="jp">固定グリッド上の正方形のセルを、グリッド側から内向きに判定するのではなく、スパインから外向きにスタンプします。細い斜めの線では、バウンディングボックス全体の走査は埋まるセルより空のセルをはるかに多く調べることになります。グリッド座標をキーにしたSetが、重なったスタンプの二重出力を防ぎます。`cell` は大きさを、`jitter` は届いたセルが間引かれる確率を決めます。</div>

### PolygonStrokeRenderer

Large flat triangles from a deliberately coarse resample. `jitter` displaces vertices across the width, which is what stops the result reading as a low-resolution ribbon: the silhouette has to break, not just the shading.
<div class="jp">意図的に粗い再サンプリングから作られる、大きな単色の三角形です。`jitter` は頂点を幅方向にずらします。これがあるからこそ、結果が低解像度のリボンに見えません。崩れる必要があるのは陰影ではなく輪郭のほうです。</div>

### LineStrokeRenderer

Parallel lines with gaps, each lane its own thin ribbon offset across the width so the lanes follow the curve. Clipping gaps out of a solid mark would leave them running straight while the stroke turned. `lanes` sets the count and `duty` the fraction of each slot that is drawn.
<div class="jp">隙間を挟んだ平行線です。各レーンは幅方向にずらされた独自の細いリボンなので、レーンは曲線に沿って進みます。塗りつぶした線から隙間を切り抜く方式では、ストロークが曲がっても隙間はまっすぐ走ったままになります。`lanes` は本数を、`duty` は各区画のうち描かれる割合を決めます。</div>


</div>
