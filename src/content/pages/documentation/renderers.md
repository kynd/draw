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
<div class="jp">レンダラは<a href="/draw/documentation/stroke-definition">`StrokeDef`</a>を`THREE.Object3D`に変換します。レンダラのインスタンスひとつで、いくつでもストロークを構築できます。保持するのはスタイルであって、特定のストロークの状態ではありません。だからこそ、レンダラはストロークごとに生成されるのではなく、定義側から参照として保持されます。</div>

`StrokeRenderer` is the base class. Subclasses implement `build(def)`; `dispose(object)` is inherited and releases the geometry and materials of anything the renderer built. `resampleSpine(def, samplesPerUnit)` is exported alongside it and does the shared resampling, so tessellation behaves identically across the group rather than being reimplemented per renderer.
<div class="jp">`StrokeRenderer`が基底クラスです。サブクラスは`build(def)`を実装します。`dispose(object)`は継承され、そのレンダラが構築したもののジオメトリとマテリアルを解放します。`resampleSpine(def, samplesPerUnit)`も併せてエクスポートされ、共通の再サンプリングを担います。これにより、テセレーションの挙動はレンダラごとに再実装されるのではなく、グループ全体で同一になります。</div>

## Common to every renderer

These hold for all renderers in `public/lib/renderers/`. A new renderer is checked against this list before it joins the group; if it cannot honour an item, the contract changes deliberately and every existing renderer changes with it.
<div class="jp">以下は`public/lib/renderers/`にあるすべてのレンダラに当てはまります。新しいレンダラは、このグループに加わる前にこのリストと照合されます。いずれかを満たせない場合は、契約そのものを意図的に変更し、既存のすべてのレンダラもそれに合わせて変更します。</div>

### Adaptive sampling

The number of spine samples is proportional to arc length, not to the control point count: `clamp(round(length × samplesPerUnit), 8, 2048)`. A short stroke costs few triangles; a long one keeps the same visual smoothness instead of stretching a fixed budget over more distance. `samplesPerUnit` is exposed on each renderer so a demo can trade quality against cost at runtime.
<div class="jp">スパインのサンプル数は、制御点の数ではなく弧長に比例します。`clamp(round(length × samplesPerUnit), 8, 2048)`。短いストロークは少ない三角形で済み、長いストロークは、固定の予算を距離に引き伸ばすのではなく、同じ見た目の滑らかさを保ちます。`samplesPerUnit`は各レンダラで公開されているので、デモ側で実行時に品質とコストのバランスを調整できます。</div>

Sampling is by arc length, so vertex density is uniform along the mark. Clustered control points do not produce clustered geometry.
<div class="jp">サンプリングは弧長基準で行うため、頂点の密度は線に沿って一様になります。制御点が密集していても、ジオメトリが密集することはありません。</div>

Spacing is curvature-weighted: samples step uniformly in a measure that accumulates with turning as well as with arc length, so a corner earns extra vertices in proportion to how hard it turns, while straight runs keep the base spacing. Density is clamped to five times the base, so a cusp cannot demand unbounded vertices.
<div class="jp">間隔は曲率で重み付けされます。サンプルは、弧長だけでなく曲がりとともに増える測度の中を等間隔に進むため、角には曲がりの強さに比例して多くの頂点が割り当てられ、直線部分は基本の間隔を保ちます。密度は基本の5倍までに制限され、カスプが無制限に頂点を要求することはありません。</div>

Samples sit at fixed arc-length steps from the start, not at even fractions of the whole. The difference only matters while a path is growing: with fractions, every added point moves every sample, and near a sharp corner a small sample shift swings the tangent, so the drawn vertices crawl. With fixed steps the settled part of the path keeps its samples, and only the tip changes.
<div class="jp">サンプルは、全長の等分割ではなく、始点から一定の弧長間隔に置かれます。この違いが問題になるのは、パスが伸びている最中だけです。等分割では、点を1つ加えるたびにすべてのサンプルが動き、急な角の近くではサンプル位置のわずかなずれが接線を大きく振るため、描かれた頂点が這うように動きます。固定間隔なら、すでに描かれた部分のサンプルはそのまま保たれ、変わるのは先端だけです。</div>

### Seeded randomness

Every renderer takes a seed. Anything random in a mark (its texture, its edge, its scatter) derives from that seed through hash functions, so the same seed with the same parameters reproduces the exact same result.
<div class="jp">すべてのレンダラはシードを受け取ります。線の中の乱数的なもの（テクスチャ、縁、散らばり）はすべて、ハッシュ関数を通してこのシードから導かれます。そのため、同じシードと同じパラメータからは、完全に同じ結果が再現されます。</div>

### 2D framing

The normal is the +90° rotation of the tangent in the XY plane. The tangent's Z component is **dropped before framing**.
<div class="jp">法線は、XY平面上で接線を+90°回転させたものです。フレームを構築する前に、接線のZ成分は<strong>捨てられます</strong>。</div>

This matters because of how depth is used. A 2D stroke ramps its Z very slightly from start to end so that where it crosses itself, the later section sits over the earlier one. That ramp is ordering information, not shape — if it were fed into the frame, the ribbon would twist out of the plane by exactly as much as the ordering trick required. Dropping Z keeps the mark flat and camera-facing while the ordering still works.
<div class="jp">これは、深度の使い方に関わる重要な点です。2Dのストロークは、始点から終点にかけてZをごくわずかに上昇させます。こうすることで、自分自身と交差する箇所では、後から描かれた部分が先に描かれた部分の上に来ます。この傾斜は順序の情報であって、形状ではありません。もしこれをフレームの計算に入れてしまうと、リボンは順序付けに必要だった分だけ平面から捻れてしまいます。Zを捨てることで、順序付けは機能したまま、線は平面にとどまり、カメラに正対し続けます。</div>

<div class="page-note">
<p>Use an orthographic camera for 2D work. Depth is linear under orthographic projection, so offsets in the range of thousandths resolve exactly — no Z-fighting, and no need for <code>polygonOffset</code>.</p>
<span class="jp">2Dの作業では正射影カメラを使ってください。正射影では深度が線形になるため、1000分の1程度のオフセットでも正確に解決されます。Zファイティングは起きず、<code>polygonOffset</code>も不要です。</span>
<p>The ramp decides crossings even when nothing looks different: with a flat opaque fill both outcomes render identically. Its job is to make the answer <strong>determined</strong> before the fill stops being flat and opaque.</p>
<span class="jp">この傾斜は、見た目に違いが出ない場合でも交差の順序を決めています。不透明な単色の塗りでは、どちらの結果も同じに描画されるからです。その役割は、塗りが単色・不透明でなくなる前に、答えを<strong>確定</strong>させておくことです。</span>

### Independent left and right width

Offsets always come from `widthLeftAt(t)` and `widthRightAt(t)` separately. No renderer assumes symmetry, including in its caps and joins.
<div class="jp">オフセットは常に`widthLeftAt(t)`と`widthRightAt(t)`から別々に取得します。どのレンダラも、端点や継ぎ目を含めて、左右対称であることを前提にしません。</div>

### UV convention

`u` runs 0 → 1 along the stroke by arc length. `v` runs 0 on the left edge to 1 on the right. Caps continue the same frame: `u` is 0 across the whole start cap and 1 across the whole end cap, while `v` sweeps 0 → 1 from the left offset round to the right.
<div class="jp">`u`は弧長に沿って0から1へ進みます。`v`は左端の0から右端の1へ進みます。端点も同じフレームを引き継ぎ、始点側の端点全体で`u`は0、終点側の端点全体で`u`は1となり、その間`v`は左のオフセットから右のオフセットへ0から1へと掃引されます。</div>

Holding this convention across the group means a texture, gradient, or shader written for one renderer keeps its meaning under another.
<div class="jp">この規約をグループ全体で守ることで、あるレンダラ向けに書いたテクスチャやグラデーション、シェーダが、別のレンダラでも同じ意味を保ちます。</div>

### Reported stats

The returned object carries `userData.samples` (the resampled spine positions) and `userData.stats` with `sampleCount`, `vertexCount`, `triangleCount`, and `length`. Demos use these to show what the tessellation is actually doing rather than asserting it in prose.
<div class="jp">返されるオブジェクトは`userData.samples`（再サンプリングされたスパインの座標）と、`sampleCount`、`vertexCount`、`triangleCount`、`length`を含む`userData.stats`を保持します。デモはこれを使って、テセレーションが実際に行っていることを、文章で主張する代わりにそのまま表示します。</div>

## RibbonStrokeRenderer

A flat ribbon along the spine, closed at both ends by one of three caps. Two triangles per segment, plus whatever the cap adds.
<div class="jp">スパインに沿った平らなリボンで、両端は3種類の端点のいずれかで閉じられます。セグメントごとに2つの三角形と、端点が追加する分の三角形で構成されます。</div>

The body is identical whichever cap is chosen. That is why the cap is an option on one renderer rather than three renderers repeating the ribbon build.
<div class="jp">どの端点を選んでも本体は同じです。だからこそ端点は、リボン生成を3度繰り返す3つのレンダラではなく、ひとつのレンダラのオプションになっています。</div>

<div class="page-note">
<ul>
<li><code>cap</code> — <code>'rounded'</code>, <code>'square'</code>, or <code>'ragged'</code>. Default <code>'rounded'</code>.<br /><span class="jp"><code>'rounded'</code>、<code>'square'</code>、<code>'ragged'</code>のいずれか。既定値は<code>'rounded'</code>。</span></li>
<li><code>color</code> — fill color, or the start color when <code>gradient</code> is set. Default <code>'#1a1a1a'</code>.<br /><span class="jp">塗りの色。<code>gradient</code>を指定した場合は始点側の色になります。既定値は<code>'#1a1a1a'</code>。</span></li>
<li><code>gradient</code> — optional end color. When set, the fill interpolates from <code>color</code> to it, written as a vertex color attribute. Default <code>null</code> (flat).<br /><span class="jp">終点側の色（省略可）。指定すると、塗りが<code>color</code>からこの色へ補間され、頂点カラー属性として書き込まれます。既定値は<code>null</code>（単色）。</span></li>
<li><code>gradientAxis</code> — <code>'along'</code> runs the gradient on <code>u</code>, following the spine; <code>'across'</code> runs it on <code>v</code>, left rail to right rail. Default <code>'along'</code>.<br /><span class="jp"><code>'along'</code>は勾配を<code>u</code>に沿って、つまりスパインに沿って走らせます。<code>'across'</code>は<code>v</code>に沿って、左のレールから右のレールへ走らせます。既定値は<code>'along'</code>。</span></li>
<li><code>opacity</code> — below 1 switches the material to transparent. Default <code>1</code>.<br /><span class="jp">1未満にするとマテリアルが半透明になります。既定値は<code>1</code>。</span></li>
<li><code>samplesPerUnit</code> — spine samples per world unit of arc length. Default <code>120</code>.<br /><span class="jp">弧長1ワールド単位あたりのスパインのサンプル数。既定値は<code>120</code>。</span></li>
<li><code>capSegmentsPerUnit</code> — rounded-cap arc segments per world unit of radius, clamped to 6 through 32. Default <code>260</code>.<br /><span class="jp">roundedの端点における、半径1ワールド単位あたりの円弧の分割数。6〜32に制限されます。既定値は<code>260</code>。</span></li>
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
<div class="jp">半径を固定せず補間することが、左右非対称なストロークを正しく終端させる鍵です。半径max(wL, wR)の円は細い側にはみ出し、半径min(wL, wR)の円は太い側を削ってしまいます。補間された掃引は、両方の縁に接する半楕円になります。</div>

Cap resolution scales with radius, so a hairline does not pay for 32 triangles it cannot show and a broad mark does not end in a visible polygon. The lower clamp at 6 keeps very thin strokes from degenerating into a wedge.
<div class="jp">端点の分割数は半径に応じて増減します。髪の毛ほどの細い線に、見えもしない32個の三角形を費やすことはなく、太い線が目に見える多角形で終わることもありません。下限の6は、非常に細いストロークが楔形に潰れるのを防ぎます。</div>

#### Ragged

A quad strip from the ribbon's end edge out to a torn outer edge, 20 segments wide. The inner row sits on the end edge so the cap seals against the body. The outer row is pushed past the end by a per-vertex depth between 0.05 and 1 times the average half-width.
<div class="jp">リボンの終端の辺から、裂けた外側の辺までを結ぶ20分割のクアッドストリップです。内側の列は終端の辺の上に置かれ、端点が本体と隙間なくつながります。外側の列は、平均の半幅の0.05倍から1倍までの、頂点ごとの深さで終端の先へ押し出されます。</div>

The depth comes from two sine samples of the vertex index offset by the stroke's `seed`, not from `Math.random`. The same seed always tears the same way, so rebuilding at a different density or color redraws the identical end. The two caps of one stroke use the seed scaled differently, so a stroke does not end symmetrically.
<div class="jp">深さは`Math.random`ではなく、頂点インデックスをストロークの`seed`でずらした2つの正弦波のサンプルから求めます。同じシードからは常に同じ裂け方が得られるため、密度や色を変えて作り直しても、終端は同じ形で描き直されます。1本のストロークの両端ではシードに異なる倍率を掛けるため、裂け方が対称になることはありません。</div>

### Shading along the stroke

Setting `gradient` interpolates the fill from `color` to `gradient` on the axis `gradientAxis` picks: `u` for 'along', `v` for 'across'. Because `u` and `v` are the parameters the UV convention defines, an 'along' gradient follows the drawn order of the mark (caps take the color of the end they close, since a cap holds `u` constant), and an 'across' gradient runs from the left rail to the right through every cap.
<div class="jp">`gradient`を指定すると、塗りが`gradientAxis`の選ぶ軸に沿って`color`から`gradient`へ補間されます。'along' は`u`、'across' は`v`です。`u`と`v`はUV規約で定義されたパラメータなので、'along' の勾配は線が描かれた順序に従い（端点はファン全体で`u`が一定のため、閉じている側の色を取ります）、'across' の勾配はすべての端点を通って左のレールから右のレールへ走ります。</div>

### Not yet handled

Self-intersection at sharp turns. Where the curvature radius drops below the local width, the two ribbon edges cross and the mark folds back on itself. This is not hypothetical. A path with a cusp, where speed passes through zero, folds into a visible notch every time. Nothing in the renderer detects it, so for now it is a constraint on the paths handed in rather than something the renderer absorbs.
<div class="jp">急な曲がりでの自己交差。曲率半径が局所的な幅を下回る箇所では、リボンの両端が交差し、線が自分の上に折り返します。これは仮定の話ではありません。速度がゼロを通過するカスプを持つパスは、必ず目に見える切れ込みとなって折れます。レンダラ側にこれを検出する仕組みはないため、当面はレンダラが吸収する問題ではなく、渡されるパスの側への制約ということになります。</div>

## ShaderStrokeRenderer

Base for renderers that shade the ribbon with their own fragment shader. Two things separate it from `RibbonStrokeRenderer`. The geometry can be built wider than the mark it draws, and the shader is given enough information to find the visual edge inside that margin.
<div class="jp">独自のフラグメントシェーダでリボンを陰影付けするレンダラの基底クラスです。`RibbonStrokeRenderer`との違いは2点あります。ジオメトリを描く線より広く作れることと、その余白の中で視覚的な輪郭がどこにあるかをシェーダに伝えられることです。</div>

Effects that reach past the stroke, a watercolor bleed or a dragged smear, need somewhere to land, and a fragment can only be shaded where a triangle covers it.
<div class="jp">にじみや引きずりのようにストロークの外へ届く効果には受け皿が必要で、フラグメントは三角形が覆う場所でしか陰影を計算できないからです。</div>

The cap is carved in the shader rather than built as geometry. Each end gets a plain quad running past the last sample, and `aBeyond` tells the shader how far past the end a fragment sits, in the same half-width units as `aCross`. `capDistance()` then returns the distance from the mark's centre line where 1.0 is the boundary, closing the shape at the ends the same way it closes at the sides. A square cap needs no room past the end, so it gets no quad at all.
<div class="jp">端点はジオメトリとして作るのではなく、シェーダで削り出します。各終端には最後のサンプルより先へ伸びる単純な四角形が置かれ、`aBeyond`が、そのフラグメントが終端からどれだけ先にあるかを`aCross`と同じ半幅の単位で伝えます。`capDistance()`は線の中心からの距離を、1.0を境界として返し、側面と同じやり方で終端の形を閉じます。squareは終端の先に余地を必要としないため、四角形自体が作られません。</div>

`singleCoverage` shades each pixel once per mark: where the ribbon overlaps itself, a translucent material would composite twice and darken into creases. The mark is flagged for the coverage layer, which renders it alone into an offscreen target with MAX blending, so any number of coverings leaves the strongest single one, and then composites the target into the canvas exactly once. There are no thresholds, so there is nothing for a seam to form along; the cost is one screen-sized composite per flagged mark per frame, only while the mark is live, since baking flattens it. Split pieces layer over each other as separate marks. The dry media turn it on.
<div class="jp">`singleCoverage`は、筆跡ごとに各ピクセルを一度だけ陰影付けします。リボンが自分の上に重なる場所では、半透明のマテリアルは二度合成されて折り目のように濃くなってしまいます。筆跡はカバレッジレイヤーに登録され、レイヤーは筆跡を単独でオフスクリーンターゲットにMAXブレンディングで描画します。何度覆われても最も強いひとつだけが残り、ターゲットはキャンバスへちょうど一度だけ合成されます。しきい値がないため、継ぎ目の生まれる場所がありません。コストは、フラグ付きの筆跡1つにつき1フレームあたり画面サイズの合成1回で、焼き込めば筆跡は平坦になるため、かかるのは筆跡が生きている間だけです。分割された断片は別々の筆跡として重なり合います。ドライメディアはこれをオンにします。</div>

<div class="page-note">
<p>Every subclass shader receives:</p>
<ul>
<li><code>vUv</code> — u along the stroke by arc length, v across the inflated width.<br /><span class="jp">uは弧長に沿った位置、vは広げた幅を横断する位置。</span></li>
<li><code>vCross</code> — signed distance across the width in visual-edge units. <code>|vCross| &lt;= 1</code> is inside the mark.<br /><span class="jp">視覚的な輪郭を1とする符号付きの幅方向の距離。<code>|vCross| &lt;= 1</code>が線の内側です。</span></li>
<li><code>vTangent</code>, <code>vWorld</code> — unit tangent and world position.<br /><span class="jp">単位接線とワールド座標。</span></li>
<li><code>screenUv()</code> — the fragment's position in the frame, for reading the background.<br /><span class="jp">背景を読むための、フレーム内でのフラグメントの位置。</span></li>
<li><code>tangentUv()</code> — the stroke's own direction as a unit step in screen UV space.<br /><span class="jp">画面UV空間での、ストローク自身の向きの単位ステップ。</span></li>
<li><code>capDistance()</code> — distance from the centre line where 1.0 is the boundary, with the cap style already applied. Effects measure against this rather than <code>abs(vCross)</code>.<br /><span class="jp">端点のスタイルを反映した、中心からの距離。1.0が境界です。各効果は<code>abs(vCross)</code>ではなくこれを基準に測ります。</span></li>
<li><code>uSeed</code>, <code>uLength</code>, <code>uWidth</code>, plus <code>fbm</code> and hash helpers.<br /><span class="jp">シード、弧長、幅に加え、<code>fbm</code>とハッシュの補助関数。</span></li>
</ul>
</div>

## BrushStrokeRenderer

Bristle streaks along the mark, an eroded edge, and dry patches where the brush ran out. The stroke carries two colors rather than one.
<div class="jp">線に沿った毛の筋、削られた輪郭、そして筆の絵の具が切れた箇所のかすれ。ストロークは1色ではなく2色を持ちます。</div>

One noise field draws the bristles, pushes the edge, and decides which pigment shows. Separate fields would let the streaks, the edge and the color disagree, and the mark would stop reading as one gesture.
<div class="jp">ひとつのノイズが、毛の筋を描き、輪郭を押し、どちらの顔料が出るかを決めます。別々のノイズでは、筋と輪郭と色が食い違い、線はひとつの身振りとして読めなくなります。</div>

The eroded edge is translucent, so the mark renders through the coverage layer by default (`singleCoverage`, on): a self-overlapping gesture keeps single coverage instead of darkening where it crosses itself.
<div class="jp">削られた輪郭は半透明なので、筆跡は既定でカバレッジレイヤーを通して描画されます（`singleCoverage`がオン）。自分と交差する身振りは、交差した場所で濃くなる代わりに単一の被覆を保ちます。</div>

<div class="page-note">
<ul>
<li><code>colorA</code> / <code>colorB</code> — the two pigments.<br /><span class="jp">2つの顔料。</span></li>
<li><code>bristles</code> — lanes across the width. Default <code>26</code>.<br /><span class="jp">幅方向のレーン数。既定値は<code>26</code>。</span></li>
<li><code>streak</code> — how far lanes stretch along the mark. Default <code>5.0</code>.<br /><span class="jp">レーンが線に沿って伸びる長さ。既定値は<code>5.0</code>。</span></li>
<li><code>rough</code> — edge erosion depth. Default <code>0.35</code>.<br /><span class="jp">輪郭の削れの深さ。既定値は<code>0.35</code>。</span></li>
<li><code>dry</code> — how much of the mark drops out. Default <code>0.30</code>.<br /><span class="jp">線が抜け落ちる量。既定値は<code>0.30</code>。</span></li>
</ul>
</div>

## DryMediaStrokeRenderer

Pencil, charcoal, and pastel are one renderer at different settings. Paper tooth is a screen-space noise, because it belongs to the paper rather than to the stroke, and coverage is the tooth thresholded, so a light line breaks into speckle instead of fading evenly. A low-frequency `pressure` noise along the stroke scales both the darkness and the drawn width.
<div class="jp">鉛筆、木炭、パステルは、ひとつのレンダラの設定違いです。紙の目は画面空間のノイズです。ストロークではなく紙に属するものだからです。被覆はその目をしきい値で切ったもので、薄い線は均一に薄れるのではなく、粒に割れて途切れます。線に沿った低周波の`pressure`ノイズが、濃さと描かれる幅の両方を変化させます。</div>

Coverage is the tooth thresholded: the mark takes where the tooth rises above a threshold that climbs from the interior out past the edge, so the boundary dissolves into grain. `grainSoft` is the width of that threshold; small it reads as a stiff dry brush, wide it softens toward pencil, charcoal, and pastel. What separates the media is scale: `tooth` is in pixels, and `softness` and `edge` set the falloff and the wobble of the boundary. Takes `color`, `grain`, `tooth`, `pressure`, `softness`, `edge`, `opacity`, `grainSoft`, and `rag` (how much the cap's end frays, in half-widths).
<div class="jp">被覆は目をしきい値処理したものです。目が、内側から縁の外へと高くなるしきい値を超えたところに顔料が乗るため、境界は粒に溶けていきます。`grainSoft`はそのしきい値の幅で、小さいと硬いドライブラシに、広いと鉛筆・木炭・パステルへと柔らかくなります。画材を分けるのはスケールです。`tooth`はピクセル単位で、`softness`と`edge`が輪郭の減衰と揺らぎを決めます。`color`、`grain`、`tooth`、`pressure`、`softness`、`edge`、`opacity`、`grainSoft`、`rag`（端点のほつれの大きさ、半幅単位）を受け取ります。</div>

With a `colors` list (up to four are used) the media turn multicolor, by `blend`: `'along'` shifts the color along the stroke, cycling the list with arc length and blending at the joins, like a pencil with a rainbow lead; `'grain'` colors each cell of the paper tooth from the list, with a slight per-cell value jitter, so the flecks read as mixed pigment.
<div class="jp">`colors`のリスト（最大4色まで使われます）を与えると、画材は`blend`に従って多色になります。`'along'`は、虹色の芯を持つ色鉛筆のように、弧長とともにリストを循環させ、継ぎ目で混ぜながらストロークに沿って色を変えます。`'grain'`は紙の目のセルごとにリストから色を取り、セルごとにわずかに明度を揺らすため、粒は混ざった顔料として読めます。</div>

## StrokeHalo

A blurred silhouette of one or more strokes, presented as a tinted plane. Not a renderer: it takes finished meshes, renders them into a private low-resolution target, blurs there, and hands back a plane to place in the scene. Offset and dark beneath a stroke the plane is a drop shadow; wide and bright around one, a glow.
<div class="jp">1本以上のストロークをぼかしたシルエットを、色付きの平面として提供します。レンダラではありません。完成したメッシュを受け取り、専用の低解像度ターゲットに描画してそこでぼかし、シーンに置くための平面を返します。ずらして暗くストロークの下に置けばドロップシャドウに、広く明るくまわりに置けばグローになります。</div>

Blurring a silhouette is the second design. Expanding the stroke's own geometry outward was the first, and it folds wherever the reach exceeds the curvature radius, which every soft shadow on a wavy path does. Takes `color`, `opacity`, `blur`, `downsample`, and `additive`; `update()` runs before the frame, from the stage's pre-render hook.
<div class="jp">シルエットをぼかすのは2番目の設計です。最初はストローク自身のジオメトリを外へ広げる方式でしたが、届く距離が曲率半径を超える場所で必ず折り重なります。うねるパスの上の柔らかい影は、必ずその条件に当たります。`color`、`opacity`、`blur`、`downsample`、`additive`を受け取り、`update()`はステージのpre-renderフックからフレームの前に実行されます。</div>

## HaloStrokeRenderer

A ribbon with a soft silhouette around it, built as one mark. The silhouette is a shader falloff on inflated geometry rather than StrokeHalo's blurred target, so the mark builds once like any other renderer's and needs no per-frame pass. Two modes: `shadow` puts the silhouette dark and offset toward the lower right, so the mark reads as floating over the canvas; `glow` puts it wide, bright, and centered. Takes `mode`, `color` (the ribbon), `haloColor`, `opacity`, and `spread`, the silhouette's reach in widths past the mark.
<div class="jp">まわりに柔らかいシルエットを持つリボンを、ひとつの筆跡として作ります。シルエットはStrokeHaloのぼかしターゲットではなく、広げたジオメトリの上のシェーダの減衰なので、筆跡は他のレンダラと同じく一度だけ作られ、フレームごとの処理を必要としません。2つのモードがあります。`shadow`はシルエットを暗くして右下へずらし、筆跡はキャンバスの上に浮いて見えます。`glow`はシルエットを広く明るくして、中央に置きます。`mode`、`color`（リボンの色）、`haloColor`、`opacity`、`spread`（シルエットが筆跡の外へ届く距離、幅単位）を受け取ります。</div>

The falloff folds with the path where the reach exceeds the curvature radius, so the silhouette renders through the coverage layer: overlaps keep single coverage instead of stacking into creases. The ribbon renders through the same layer, because layered marks draw after the main pass in depth order among themselves, and only another layered mark can composite above the silhouette.
<div class="jp">減衰は、届く距離が曲率半径を超える場所でパスに沿って折り重なります。そのためシルエットはカバレッジレイヤーを通して描画され、重なりは折り目として積み重なる代わりに単一の被覆を保ちます。リボンも同じレイヤーを通します。レイヤー化された筆跡はメインパスの後に、筆跡同士の深度順で描かれるため、シルエットの上に合成できるのは別のレイヤー化された筆跡だけだからです。</div>

## DebossStrokeRenderer

A flat fill with an inner shadow, so the stroke reads as cut out of the paper. A band inside the boundary darkens where its outward direction faces a fixed light, the shadow the lit rim of a cutout casts onto its floor. There is no highlight: a hole has nothing to catch the light with. The outward direction comes from the stroke frame, so the ends shade the same way the sides do. Takes `color`, `bevel`, `amount`, and `angle`.
<div class="jp">内側に影を持つ平坦な塗りで、ストロークは紙から切り抜かれたように見えます。輪郭の内側の帯は、外向きの方向が固定光源を向く場所で暗くなります。切り抜きの光の当たる縁が底に落とす影です。ハイライトはありません。穴には光を受け止めるものがないからです。外向きの方向はストロークの座標系から求めるため、終端も側面と同じように陰影付けされます。`color`、`bevel`、`amount`、`angle`を受け取ります。</div>

## Background samplers

Three renderers that read what is underneath and move it. All take a `background` texture and sample it by screen position, because a stroke does not know what is under it and asking in pixels is the only question that has an answer.
<div class="jp">下にあるものを読み、それを動かす3つのレンダラです。いずれも`background`テクスチャを受け取り、画面上の位置で参照します。ストロークは自分の下に何があるかを知らず、答えの得られる問い方はピクセルで尋ねることだけだからです。</div>

### WatercolorStrokeRenderer

Captured in two stages, so a stroke that folds over itself never seams or darkens. A flat solid silhouette renders through the coverage layer first: MAX blending over a uniform shape gives one clean union whatever the overlap. A post-process composite then paints the wash from that mask, blurring the coverage into a soft feathered edge, breaking it up with noise (irregular but smooth, since it comes from a blurred field rather than a hard geometry edge), collecting a rim where the coverage falls off, and mixing the background through a noise-bent lens.
<div class="jp">2段階で捉えるため、自分自身の上に折り返すストロークでも継ぎ目や濃みが出ません。まず平坦で単色のシルエットをカバレッジレイヤーで描きます。均一な形へのMAXブレンディングは、どんな重なりでもひとつのきれいな和になります。次に、後処理のコンポジットがそのマスクから水彩を描きます。カバレッジをぼかして柔らかく羽状の縁にし、ノイズで縁を崩し（硬いジオメトリの縁ではなくぼかした場から来るため、不規則でも滑らかです）、カバレッジが落ちるところにrimを集め、ノイズで曲げたレンズ越しに背景を混ぜます。</div>

Takes `pigment`, `rim`, `granulation`, `edge`, `bleed`, and `feather` (the edge blur radius) alongside `background`. The rim darkens just inside the boundary, where water dries back and leaves pigment.
<div class="jp">`background`に加えて`pigment`、`rim`、`granulation`、`edge`、`bleed`、`feather`（縁のぼかし半径）を取ります。rimは輪郭のすぐ内側を濃くします。水が引きながら乾き、そこに顔料を残すからです。</div>

`bleed` picks the background up through taps displaced by a 2D noise field, unrelated to the stroke's direction, so what lies underneath seeps into the wash in blotches rather than streaks. Wetter blotches bend the taps farther, and some taps read the sharp background, so edges underneath grow warped tendrils instead of staying put. Where the blotch noise runs wet, the pigment thins and more background shows through.
<div class="jp">`bleed`は、ストロークの向きと無関係な2Dノイズ場でずらしたサンプリングで背景を拾います。そのため、下にあるものは筋ではなくにじみとして水彩に染み込みます。濡れたにじみほどサンプリングは遠くへ曲がり、一部のサンプリングは鮮明な背景を読むため、下にあるエッジはその場に留まらず、ゆがんだ触手を伸ばします。にじみのノイズが濡れているところでは顔料が薄まり、背景がより透けます。</div>

### SmearStrokeRenderer

Walks backward along the stroke's own direction in screen space and averages what it finds, so the background is streaked the way the mark travelled. `drag` sets the reach in pixels and `variation` how much it differs from lane to lane.
<div class="jp">画面上でストローク自身の向きに沿って後方をたどり、見つけたものを平均するため、背景には線が進んだ方向の筋が入ります。`drag`は届く距離をピクセルで、`variation`はレーンごとの差を決めます。</div>

The variation is what stops the result reading as motion blur. A real brush drags hard under some bristles and barely at all under others.
<div class="jp">この変化があるからこそ、結果がモーションブラーに見えません。実際の筆は、ある毛の下では強く引きずり、別の毛の下ではほとんど引きずらないからです。</div>

### WetBrushStrokeRenderer

The drag runs first, over a mix of the sharp and softened background set by `wet`, and the wash then tints what the drag produced. Blending two finished results would wash out the streaks, because an even blur and a directional smear cancel each other where they disagree.
<div class="jp">まず引きずりが、`wet`で決まる鮮明な背景とぼかした背景の混合の上で走り、そのあとで水彩がその結果を染めます。仕上がった2つの結果を混ぜると筋は消えます。一様なぼかしと方向を持つ引きずりは、食い違う場所で互いを打ち消すからです。</div>

## Height field materials

`HeightFieldStrokeRenderer` gives the mark a height built from distance to the edge, which rounds the cross-section into a bead, and noise stretched along the path, which reads as liquid dragged by the brush. Subclasses shade the resulting normal.
<div class="jp">`HeightFieldStrokeRenderer`は、輪郭からの距離（断面を丸い盛り上がりにする）と、パスに沿って引き伸ばされたノイズ（筆で引きずられた液体に見える）から、線に高さを与えます。サブクラスはその法線を使って陰影を付けます。</div>

<div class="page-note">
<p>The bead is parabolic, not a hemisphere. A hemisphere's slope runs to infinity at the rim, which turns every fragment near the edge into noise once a finite difference is taken across it.</p>
<span class="jp">盛り上がりは半球ではなく放物線です。半球は縁で傾きが無限大に発散し、そこで差分を取ると輪郭付近のフラグメントはすべてノイズになります。</span>
<p>Height is measured in units of the half-width, and so is the across coordinate, so the gradient is dimensionless and needs no correction factor at any width.</p>
<span class="jp">高さは半幅を単位として測られ、幅方向の座標も同じ単位です。そのため勾配は無次元となり、どの太さでも補正係数が不要です。</span>
<p>Normals come from finite differences in the stroke's own frame, not from <code>dFdx</code>. Screen-space derivatives break down along the silhouette, which is exactly where the bead turns over fastest.</p>
<span class="jp">法線は<code>dFdx</code>ではなく、ストローク自身の座標系での差分から求めます。画面空間の微分は輪郭沿いで破綻しますが、そこはまさに盛り上がりが最も急に折り返す場所です。</span>
</div>

### ChromeStrokeRenderer

An assumed environment of two tones split at a horizon. A mirror shows mostly a bright sky and a dark ground, and the eye reads the boundary sweeping across a curved surface as metal.
<div class="jp">環境を、地平線で分かれた2つの色調と仮定します。鏡に映るのはおおむね明るい空と暗い地面であり、その境界が曲面の上を走るのを、目は金属として読み取ります。</div>

### FrostedGlassStrokeRenderer

The clear-glass lens, roughened so it scatters instead of imaging. Each fragment takes several taps around its background lookup, each offset in a per-pixel random direction, and averages them, so the refraction reads grainy and blurred rather than as a sharp bend. `grain` sets the scatter radius; at zero it collapses back to plain glass. A soft, broad highlight stands in for the sharp specular, since frost scatters that too.
<div class="jp">透明なガラスのレンズを粗くし、像を結ばずに散乱するようにしたものです。各フラグメントは背景の参照の周りで複数回サンプルを取り、それぞれをピクセルごとにランダムな方向へずらして平均します。そのため屈折は、鋭く曲がるのではなく、ざらついて滲んで見えます。`grain`は散乱の半径を決め、ゼロでは通常のガラスに戻ります。鋭いスペキュラの代わりに、柔らかく広いハイライトが乗ります。すりガラスもそれを散らすからです。</div>

### GlassStrokeRenderer

Refraction offsets the lookup along the normal, so the bead acts as a lens and displaces most where it tilts hardest. Reflection is mixed in by a Fresnel term, which is what stops the result reading as a smudge.
<div class="jp">屈折は参照位置を法線方向にずらすため、盛り上がりはレンズとして働き、最も傾く場所でずれが最大になります。反射はフレネル項で混ぜられ、これがあるからこそ結果が汚れに見えずに済みます。</div>

### OilStrokeRenderer

Thick paint: the smear's drag under a dominant paint color, lit through the height field. The dragged background is mixed under `color` at the `paint` ratio, thinner where the height field dips, and the relief is lit with diffuse and specular terms from a fixed light.
<div class="jp">厚塗りの絵の具です。smearの引きずりを支配的な絵の具の色の下で行い、高さフィールドを通して照らします。引きずられた背景は`paint`の比率で`color`の下に混ぜられ、高さフィールドが低い場所では層が薄くなります。起伏は固定光源からの拡散反射と鏡面反射で照らされます。</div>

The drag and the ridges share one lane noise, so the paint that moved furthest also sits highest. Coverage varies by the same lanes: loaded lanes lay solid paint, dug lanes carry the dragged background through nearly bare. Takes `background`, `drag`, `paint`, `gloss`, and `shininess`, plus the height field options.
<div class="jp">引きずりと畝はひとつのレーンノイズを共有するため、最も動いた絵の具が最も高く盛り上がります。被覆も同じレーンに従って変わります。絵の具をたっぷり含んだレーンは不透明に塗り、掘れたレーンは引きずられた背景をほとんど素のまま通します。`background`、`drag`、`paint`、`gloss`、`shininess`に加え、高さフィールドのオプションを受け取ります。</div>

## Shaped strokes

Renderers whose outline is a shape rather than a thickened path. The rounded squares and spikes evaluate a signed-distance field per fragment, over a canvas wide enough to cover the shape. The cloud stamps its discs as geometry.
<div class="jp">輪郭が、太らせたパスではなく形そのものであるレンダラです。角丸の正方形とトゲは、形を覆うのに足りる広さのキャンバス上で、フラグメントごとに符号付き距離場を評価します。雲は円をジオメトリとしてスタンプします。</div>

### CloudStrokeRenderer

Large discs scattered along the stroke. The mark is flat and one color, so the discs need no union: overlapping discs of the same color read as one shape, and the outline is just their outer arcs. Each disc is a quad with a soft circular edge, drawn transparent so the coverage of overlapping discs combines and the boundary is antialiased without a per-fragment search. Size is seeded per disc, and the discs are thrown mostly to the side, along the spine's normal to either edge, so the cloud bulges out from the center line. Every third disc stays near the spine at full radius, so the chain cannot break. The discs are spaced to a fraction of their radius, so density holds for a stroke of any length and nothing caps the count. Takes `color`, `blob`, and `offset`, both in half-widths.
<div class="jp">ストロークに沿って散らされた大きな円です。筆跡は平坦で一色なので、円に和集合は要りません。同じ色の重なった円はひとつの形として読め、輪郭はその外側の弧にすぎません。各円は柔らかい円形の縁を持つ矩形で、透明に描かれるため、重なった円の被覆が合わさり、フラグメントごとの探索なしに境界がアンチエイリアスされます。大きさは円ごとにシードで決まり、円は主に横方向へ、スパインの法線に沿ってどちらかの縁へ振り出されるため、雲は中心線から横にふくらみます。3つに1つの円は最大の半径のままスパインの近くに留まるため、連なりが途切れることはありません。円は半径の何分の一かの間隔で置かれるため、どんな長さのストロークでも密度は保たれ、その数に上限はありません。`color`、`blob`、`offset`（どちらも半幅単位）を受け取ります。</div>

### RoundedSquareStrokeRenderer

Rounded squares on a fixed grid, stamped from the spine like the pixel stroke and drawn as a smooth minimum over every cell's rounded-box distance. Adding a square reshapes the outline around it instead of overlapping it. Takes `color`, `cell`, `corner`, and `blend`.
<div class="jp">固定グリッド上の角丸の正方形です。ピクセルのストロークと同じくスパインからスタンプされ、全セルの角丸ボックス距離のsmooth minimumとして描かれます。正方形を加えると、重なるのではなくその周りの輪郭が作り直されます。`color`、`cell`、`corner`、`blend`を受け取ります。</div>

### SpikeStrokeRenderer

The boundary pushed outward by a blade profile. A straight-sided component keeps each spike broad and the valleys narrow, and a power of a triangle wave draws the tip to a point, whose corner survives any power. The spikes rise only along the body, so each cap closes on a plain rounded curve. Each spike hashes its own height and lean from its index, spacing is warped by a low-frequency noise, and the two sides hash independently, so the edges do not mirror. `spikes` is a rate that scales with the stroke's width, so spikes-per-width holds and a wide stroke is not left with a few spikes spaced far apart. Takes `color`, `spikes`, `amp`, and `sharp` (the tip's needleness).
<div class="jp">境界を刃のプロファイルで外へ押し出したものです。直線的な成分が各トゲを太く、谷を狭く保ち、三角波の累乗が先端を点へと引き絞ります。その角はどんな累乗でも残ります。トゲは本体に沿ってのみ立ち上がるため、各キャップはただの丸い曲線で閉じます。各トゲは高さと傾きを自身のインデックスのハッシュから決め、間隔は低周波のノイズでゆがめられ、両側は独立にハッシュされるため、左右の縁が鏡映しになることはありません。`spikes`はストロークの幅に応じて変化するレートで、幅あたりのトゲの数が保たれるため、幅の広いストロークでトゲがまばらに離れて残ることはありません。`color`、`spikes`、`amp`、`sharp`（先端の鋭さ）を受け取ります。</div>

## Pattern strokes

`PatternStrokeRenderer` rebuilds the mark as many small elements filling the stroke's band. Three modes fill the band with rows: `dashes` (short rounded strokes, about 20 pixels each, laid along the spine and stepped by about three quarters of their own length), `dots` (uneven discs of 10 to 15 pixels, wobbled by seeded harmonics of the angle so each reads as a circle drawn by hand), and `strips` (longer and wider than the dashes, with more rotation and placement jitter and tighter rows, so neighbors sometimes overlap). Three more sprout small strokes from the spine to both sides, swept from the local direction by `angle`, their length following the local width: `feather` (each left-right pair takes `color` and the next pair `colorB`, like a feather's bands), `leaves` (tapered leaf shapes with a seeded bow, sized randomly from well below the width to well past it, textured like the brush: bristle streaks run the blade's length, erode its edge, streak its color, and drop dry patches), and `fringe` (thinner and denser, `color` on one side of the spine and `colorB` on the other). Takes `mode`, `color`, `colorB`, `angle`, and `size`, a scale on the elements' built-in pixel sizes. Each element carries a slight lightness variation of its color.
<div class="jp">`PatternStrokeRenderer`は、筆跡をストロークの帯を埋めるたくさんの小さな要素として作り直します。3つのモードは帯を列で埋めます。`dashes`（約20ピクセルの短い丸みのあるストロークで、スパインに沿って置かれ、自分の長さの約4分の3ずつ進みます）、`dots`（10から15ピクセルの不揃いな円で、角度のシード付き倍音で揺らされ、それぞれが手で描かれた円として読めます）、`strips`（ダッシュより長く幅広で、回転と配置の揺れが大きく、列が詰まっているため、隣同士がときどき重なります）。さらに3つのモードは、スパインから両側へ小さなストロークを生やします。局所的な向きから`angle`だけ振られ、長さは局所的な幅に従います。`feather`（左右のペアが`color`と`colorB`を交互に取り、羽の縞のようになります）、`leaves`（シード付きの反りを持つ先の尖った葉の形で、幅よりずっと小さいものから大きく超えるものまでランダムな大きさになります。筆と同じ質感を持ち、穂の筋が葉身に沿って走り、縁を削り、色に筋を付け、かすれを落とします）、`fringe`（より細く密で、スパインの片側が`color`、もう片側が`colorB`になります）。`mode`、`color`、`colorB`、`angle`、そして要素の組み込みピクセルサイズへの倍率である`size`を受け取ります。各要素の色には、わずかな明度の揺らぎが付きます。</div>

Elements sit on rows across the width, each row walking the arc from the start with its own seeded random sequence, so a growing stroke adds elements at the tip without reshuffling the ones already placed. Row offsets scale with the local width, so the fill follows the taper.
<div class="jp">要素は幅方向の列の上に並び、各列はそれぞれのシード付き乱数列で始点から弧をたどります。そのため、伸びていくストロークは先端に要素を加えるだけで、すでに置かれたものを並べ直しません。列のオフセットは局所的な幅に比例するので、塗りはテーパーに従います。</div>

`WetPatternStrokeRenderer` keeps the placement and swaps the elements' surface for wet marks that drag the background. A dash or strip walks backward along its own direction in screen space and averages what it finds, dragging harder toward its tail; a dot pulls the surrounding color inward, so it reads as a blot. Takes `background`, `drag` (reach in pixels), and `pigment` (the ratio of the element's color over the drag) alongside the base parameters.
<div class="jp">`WetPatternStrokeRenderer`は配置をそのままに、要素の表面を背景を引きずる濡れた筆跡に置き換えます。ダッシュと帯は画面上で自分の向きに沿って後方をたどり、見つけたものを平均します。尾に向かうほど強く引きずります。点は周囲の色を内側へ引き込むため、しみとして読めます。基本のパラメータに加えて、`background`、`drag`（届く距離、ピクセル）、`pigment`（引きずりに対する要素の色の比率）を受け取ります。</div>

## AroundStrokeRenderer

Paths derived from the drawn path, each drawn with the brush renderer. Four modes: `spiral` (the tip circles while its center moves along the path, one continuous coil), `entangled` (copies of the path offset by seeded low-frequency waves, their endpoints pulled back toward the base), `scattered` (short strokes copying small segments of the path, moved sideways by a seeded offset), and `wiggle` (one path crossing the base from side to side, its wavelength tightening from loose at the start to tight at the end). Every spatial size (the radius, the wave amplitude, the scatter offset) follows the width, so a heavier stroke spreads further; every count (the spiral's turns, the wiggle's crossings, the scatter's strokes) follows the path's length, so the pattern keeps its spacing as the stroke grows instead of crowding a short stroke and stretching a long one. The width is capped at 0.03 world units for the derivation, the range the formulas are calibrated for. Takes `mode`, `colorA`, `colorB` (alternated between sub-strokes), `reach` (how far the derived paths stray, in widths), and `cycle` (the spiral's advance per turn, as a multiple of its radius, so at 1 the loops half-overlap and near 2 they sit beside each other). The generators are documented on the Path Effects page.
<div class="jp">描かれたパスから導いたパスを、それぞれbrushレンダラで描きます。4つのモードがあります。`spiral`（中心がパスに沿って進むあいだ、先端が円を描く、一本の連続したコイル）、`entangled`（シード付きの低周波の波でずらされたパスの複製で、端点は元のパスへ引き戻されます）、`scattered`（元のパスの一部を写し取り、シード付きのオフセットで横へ移動する短いストローク）、`wiggle`（元のパスを左右に横切る一本のパスで、波長は始めのゆるいものから終わりのきついものへと詰まります）。空間的な大きさ（半径、波の振幅、散布のオフセット）はすべて幅に従うため、太いストロークほど遠くへ広がります。本数（スパイラルの回転、ウィグルの横切り、散布のストローク）はすべてパスの長さに従うため、短いストロークで詰まり長いストロークで伸びることなく、パターンは間隔を保ちます。導出に使う幅は0.03ワールド単位で頭打ちになります。式が調整された範囲だからです。`mode`、`colorA`、`colorB`（サブストロークごとに交互）、`reach`（導いたパスが離れる距離、幅単位）、`cycle`（スパイラルの1回転あたりの進み、半径の倍数。1でループは半分重なり、2付近で隣り合います）を受け取ります。生成器の説明はPath Effectsページにあります。</div>

## Blob renderers

Renderers that fill a closed region rather than a stroke. The geometry is only a quad over the contour's bounds; the shape lives in the fragment shader as the signed distance to the contour polygon, so a renderer can push the boundary, texture the interior, or shade it as a surface without new geometry. `BlobRenderer` is the base; contours come from `blobOutline` or the endpoint shapes on the Path Effects page. The prelude also provides `uvAt(p)`, the background uv of an arbitrary world point, so a shader can read the canvas somewhere other than under its own fragment.
<div class="jp">ストロークではなく閉じた領域を塗るレンダラです。ジオメトリは輪郭の範囲を覆う四角形だけで、形はフラグメントシェーダの中の、輪郭ポリゴンへの符号付き距離として存在します。そのためレンダラは、新しいジオメトリなしに境界を押したり、内部にテクスチャを与えたり、面として陰影付けしたりできます。基底クラスは`BlobRenderer`で、輪郭はPath Effectsページの`blobOutline`か端点の形から得られます。プレリュードには`uvAt(p)`もあり、任意のワールド座標の背景uvが得られるため、シェーダは自身のフラグメントの真下以外の場所のキャンバスを読めます。</div>

The renderers that shade a height field build it from the distance to the edge, and the edge dome's depth caps at the contour's inradius, measured once at build. Without the cap, a region narrower than the dome would carry the distance field's crease along its middle into the lighting as a sharp ridge; with it, the slopes flatten before they meet.
<div class="jp">高さフィールドを陰影付けするレンダラは、高さを輪郭からの距離で作ります。縁のドームの深さは、構築時に一度測った輪郭の内接半径で頭打ちになります。この上限がないと、ドームより狭い領域では、距離場が中央に持つ折り目がそのまま照明に鋭い稜線として現れます。上限があれば、斜面は出会う前に平らになります。</div>

<div class="page-note">
<ul>
<li><code>ShapedBlobRenderer</code> — a flat fill whose boundary grows spikes (an integer count around the loop, so the profile meets itself in a valley) and bumps (a noise of world position, so no seam). Each spike hashes its height and lean. Spikes only stick out: every valley returns to the base contour, so the fill always covers its region and the seam meets itself at zero. With <code>colorB</code> and two world points (<code>gradientFrom</code>, <code>gradientTo</code>) the fill becomes a linear gradient between them.<br /><span class="jp">境界にトゲ（ループ全体で整数本なので、プロファイルは谷で自分自身と出会います）とうねり（ワールド座標のノイズなので継ぎ目がありません）を生やす平坦な塗りです。各トゲは高さと傾きをハッシュから決めます。トゲは外側にだけ突き出します。谷は必ず元の輪郭まで戻るため、塗りはつねに自分の領域を覆い、継ぎ目はゼロで出会います。<code>colorB</code>と2つのワールド座標（<code>gradientFrom</code>、<code>gradientTo</code>）を与えると、塗りはその間の線形グラデーションになります。</span></li>
<li><code>SlitScanBlobRenderer</code> — a fill colored by slit-scanning the canvas: the background is read only along one sampling line, and every fragment takes the sample at its projection onto that line, so each sample stretches into a band orthogonal to it. The result mixes with a flat base color. Takes <code>color</code>, <code>background</code>, <code>mix</code>, <code>linePoint</code>, <code>lineAngle</code>; <code>slitLineFromEnds(a, b, seed)</code> rolls a seeded line through the endpoints' midpoint.<br /><span class="jp">キャンバスをスリットスキャンして塗るレンダラです。背景は1本のサンプリングの線に沿ってだけ読まれ、各フラグメントはその線への射影の位置にあるサンプルを取ります。そのため各サンプルは線と直交する帯として引き伸ばされます。結果は平坦なベースの色と混ぜられます。<code>color</code>、<code>background</code>、<code>mix</code>、<code>linePoint</code>、<code>lineAngle</code>を受け取ります。<code>slitLineFromEnds(a, b, seed)</code>は、端点の中点を通るシード付きの線を返します。</span></li>
<li><code>PaintBlobRenderer</code> — two pigments mixed in smooth patches, with relief from a quintic edge dome (no corner in the shading at either end) plus low and high noise bands, the high one foldable into sharp ridges; <code>dry</code> erodes the fill into dense tooth speckle, <code>split</code> sharpens the pigment mix to a hard boundary shaped by low-frequency noise, and <code>rag</code> tears the edge on a fine noise. <code>knife</code> shapes the fill as palette-knife work: flat patches, each with its own drag direction and striations along it, meeting at hard steps, under a rim that varies from tall and steep to scraped flat, and an edge of straight cut segments. Takes <code>colorB</code>, <code>fade</code>, <code>relief</code>, <code>swell</code>, <code>ridged</code>, <code>gloss</code>, <code>edgeSoft</code>, <code>dry</code>, <code>split</code>, <code>rag</code>, <code>knife</code>.<br /><span class="jp">なだらかな斑で混ざる2つの顔料。起伏は5次の縁のドーム（陰影のどちらの端にも角が出ません）と低周波・高周波のノイズからなり、高周波は折り返して鋭い畝にできます。<code>dry</code>は塗りを密な粒に削り、<code>split</code>は顔料の混合を低周波ノイズが形作る硬い境界へと鋭くし、<code>rag</code>は縁を細かいノイズで破ります。<code>knife</code>は塗りをペインティングナイフの仕事として形作ります。平らな斑がそれぞれ独自の引き方向とそれに沿った筋を持って硬い段差で出会い、その上に、高く急な区間から削がれて平らな区間まで変化する縁の盛り上がりが乗り、輪郭はまっすぐに切られた線分になります。</span></li>
<li><code>WashBlobRenderer</code> — a watercolor fill over the background, dragged along a wandering flow. The paint meets the background as a min (layered pigment) and a mix (covering body), balanced by <code>wet</code>. <code>bristle</code> grows brush marks at the edge along directions that wander with position. Takes <code>pigment</code>, <code>feather</code>, <code>rim</code>, <code>flow</code>, <code>wet</code>, <code>bristle</code>.<br /><span class="jp">揺らぐ流れに沿って引きずられる、背景の上の水彩の塗り。絵の具はmin（重ねた顔料）とmix（覆う身）として背景と出会い、<code>wet</code>がその配分を決めます。<code>bristle</code>は位置とともに揺らぐ方向に沿って、縁に筆の跡を生やします。</span></li>
<li><code>MaterialBlobRenderer</code> — metal takes a ridged relief (broad swell folded with sharp creases) reflecting a chrome environment of hard-edged light bands over a dark ground; smooth glass keeps a low-frequency wave surface and bends the background; faceted glass takes one random tilt per triangle of a noise-warped lattice. Takes <code>mode</code>, <code>relief</code>, <code>bend</code>, <code>facets</code>.<br /><span class="jp">金属は、大きなうねりに鋭いひだを折り重ねた起伏を取り、暗い地面の上に硬い縁の光の帯を持つクロームの環境を反射します。滑らかなガラスは低周波のうねりの面を保ち、背景を曲げます。面取りガラスは、ノイズでゆがめた格子の三角形ごとにひとつのランダムな傾きを取ります。</span></li>
<li><code>StoneBlobRenderer</code> — the blob as stone. Rock folds its noise into creases with mottled color patches, and its boundary breaks on the same crags; marble runs thin noise-warped veins over a near-white glossy ground; sand jitters the normal per pixel from a hashed grid, with occasional glints, and its edge dissolves into loose grains. Takes <code>mode</code>, <code>colorB</code>, <code>relief</code>.<br /><span class="jp">石としてのブロブ。岩はノイズをひだに折り返し、色を斑に散らし、境界も同じ岩肌で割れます。大理石は白に近い光沢のある地の上に、ノイズでゆがめた細い脈を走らせます。砂はハッシュした格子からピクセルごとに法線を揺らし、ときおり粒をきらめかせ、縁はばらけた粒に崩れます。</span></li>
</ul>
</div>

## 3D strokes

Strokes built from 3D shapes around the spine, lit and baked onto the canvas like any other mark. `Stroke3DRenderer` is the base: the spine gains depth from a seeded wave whose wavelength tracks the stroke's width (so a wide tube snakes as gently as a thin one rather than rippling faster than it is thick), so the mark reads as an object lying over the canvas, and the shape rotates around the spine by an angle keyed to the distance from the stroke's start. A seeded offset also pushes the shape slightly off the spine, in a direction that rotates with the same angle, so the mark orbits the spine along its length. Every one of these keys on distance from the start, so the drawn part holds still as the stroke grows. The mark floats about 100 CSS pixels over the canvas, lit from the upper left (60 degrees down from the screen's up axis, 30 degrees to the left of the camera). A tube cannot bend tighter than its own radius without the inner wall crossing itself and tearing the surface, so the centerline is eased to that limit before the rings are built, in proportion to how far past it each bend is: a thin tube keeps its corners, a fat one rounds them the way a real tube of that thickness would. The ring's reach toward a bend's center is still clamped as a backstop, and any residual fold is drawn double-sided with the inward normal flipped, so it reads as a crease rather than a hole. Both members take `depth`, `twist`, `zBase`, and `wander` (the offset's amplitude).
<div class="jp">スパインの周りの3D形状から作られ、他の筆跡と同じように照らされてキャンバスに焼き込まれるストロークです。基底クラスは`Stroke3DRenderer`です。スパインは、波長がストロークの幅に追従するシード付きの波から深さを得るため（幅の広いチューブは、太さより速く波打つのではなく、細いものと同じくらいゆるやかにうねります）、筆跡はキャンバスの上に置かれた物体として読めます。また、形はストロークの始点からの距離に応じた角度でスパインの周りを回ります。シード付きのオフセットも形をスパインからわずかに押し出し、その方向は同じ角度で回転するため、筆跡はスパインの周りを長さに沿って周回します。これらはいずれも始点からの距離に基づくため、描かれた部分はストロークが伸びても動きません。筆跡はキャンバスの約100CSSピクセル上に浮かび、左上からの光（画面の上方向から60度、カメラから左へ30度）に照らされます。チューブは自身の半径より急には曲がれず、無理に曲げると内壁が自分自身と交差して面が裂けます。そこでリングを組む前に、超過の度合いに応じて中心線をその限界までならします。細いチューブは角を保ち、太いチューブはその太さのチューブが実際にそうなるように角を丸めます。曲がりの中心に向かうリングの届く距離も予備として制限され、残った折れは両面描画で内向きの法線を反転して描かれるため、折れは穴ではなく折り目として読めます。どちらのメンバーも<code>depth</code>、<code>twist</code>、<code>zBase</code>、<code>wander</code>（オフセットの振幅）を取ります。</div>

<ul class="doc-list">
<li><code>TubeStrokeRenderer</code> — a tube closed by rounded caps, in three looks: <code>candy</code> (diagonal stripes from a color list, wrapping with the tube's angle, shaded like glossy plastic: the shadow side and the rim fall back to a saturated deep version of the stripe color, under a tight white highlight), <code>wobble</code> (the radius swells and thins on a seeded wave that advances by arc measured in widths, so the swell keeps its shape as the tube grows, and the color runs a gradient driven by the wobble and the position along the stroke), and <code>metal</code> (the current canvas is the environment map: the reflected direction offsets a lookup into it). Takes <code>mode</code>, <code>colors</code>, <code>colorA</code>, <code>colorB</code>, <code>tint</code>, <code>background</code>, <code>stripes</code>, <code>wobbleFreq</code>, <code>bend</code>.<br /><span class="jp">丸いキャップで閉じられたチューブで、3つの見た目を持ちます。<code>candy</code>（色のリストからなる斜めの縞がチューブの角度とともに巻き付き、光沢のあるプラスチックとして陰影付けされます。影の側と縁は縞の色の彩度の高い深い色へ落ち、鋭い白いハイライトが乗ります）、<code>wobble</code>（半径はシード付きの波でふくらみ、細ります。波は幅を単位にした弧に沿って進むため、チューブが太くなってもうねりの形は保たれます。色はうねりとストロークに沿った位置に従うグラデーションになります）、<code>metal</code>（現在のキャンバスが環境マップで、反射方向がその参照をずらします）。</span></li>
<li><code>TetrahedronStrokeRenderer</code> — a chain of flat-shaded 3D tetrahedrons, each taking a random size and orientation from the stroke's seed; the step between neighbors is their two circumradii plus <code>spacing</code> of their sum, so they cannot touch. <code>facets</code> keeps the base color's hue while lightness and chroma vary per face; <code>colors</code> gives every face one flat random color from the <code>colors</code> list; <code>metal</code> reflects the canvas, broken per face by the flat normals. Takes <code>mode</code>, <code>colorA</code>, <code>colors</code>, <code>tint</code>, <code>background</code>, <code>spacing</code>, <code>bend</code>.<br /><span class="jp">フラットに陰影付けされた3D四面体の連なりで、各四面体はストロークのシードからランダムな大きさと向きを取ります。隣どうしの間隔は2つの外接半径にその和の<code>spacing</code>倍を足したものなので、四面体どうしが触れることはありません。<code>facets</code>は基本色の色相を保ちながら面ごとに明度と彩度を変えます。<code>colors</code>は各面に<code>colors</code>リストから平坦なランダムの色をひとつ与えます。<code>metal</code>はキャンバスを反射し、フラットな法線がそれを面ごとに割ります。</span></li>
</ul>

## Geometry renderers

Three renderers that keep the path, the width and the resampling and throw away the ribbon. The same `StrokeDef` drives all of them.
<div class="jp">パス、幅、再サンプリングを保ったまま、リボンだけを捨てる3つのレンダラです。同じ`StrokeDef`がそのすべてを駆動します。</div>

These have no fragment shader to carve a cap out of, so they close their ends by extending vertices along the tangent by `capExtent(cap, lateral)`. For a rounded cap that profile is a circle, so the outer lanes and facets stop short of the middle ones and the rounded end is built from the stroke's own parts.
<div class="jp">これらには端点を削り出すフラグメントシェーダがないため、`capExtent(cap, lateral)`の分だけ頂点を接線方向に伸ばして終端を閉じます。roundedではそのプロファイルが円になるので、外側のレーンや面は中央のものより手前で止まり、丸い終端がストローク自身の部品から組み立てられます。</div>

All three place colors with a seeded generator rather than `Math.random`. A drawing that looks random has to redraw identically, or a change to one control could never be compared against the frame before it.
<div class="jp">3つとも、色の配置に`Math.random`ではなくシード付きの生成器を使います。ランダムに見える絵も、同じ結果で描き直せなければなりません。そうでなければ、コントロールを1つ変えた結果を、直前のフレームと比べようがないからです。</div>

### PixelStrokeRenderer

Square cells on a fixed grid, stamped from the spine outward rather than tested from a grid inward. A grid over the bounding box would test far more empty cells than filled ones for a thin diagonal mark. A Set keyed by grid coordinate keeps overlapping stamps from emitting a cell twice. `cell` sets the size and `jitter` the chance a reachable cell is dropped.
<div class="jp">固定グリッド上の正方形のセルを、グリッド側から内向きに判定するのではなく、スパインから外向きにスタンプします。細い斜めの線では、バウンディングボックス全体の走査は埋まるセルより空のセルをはるかに多く調べることになります。グリッド座標をキーにしたSetが、重なったスタンプの二重出力を防ぎます。`cell`は大きさを、`jitter`は届く範囲のセルが間引かれる確率を決めます。</div>

### PolygonStrokeRenderer

Large flat triangles from a deliberately coarse resample. `jitter` displaces vertices across the width, which is what stops the result reading as a low-resolution ribbon: the silhouette has to break, not just the shading.
<div class="jp">意図的に粗い再サンプリングから作られる、大きな単色の三角形です。`jitter`は頂点を幅方向にずらします。これがあるからこそ、結果が低解像度のリボンに見えません。崩れなければならないのは、陰影だけでなく輪郭そのものです。</div>

### LineStrokeRenderer

Parallel lines with gaps, each lane its own thin ribbon offset across the width so the lanes follow the curve. Clipping gaps out of a solid mark would leave them running straight while the stroke turned. `lanes` sets the count and `duty` the fraction of each slot that is drawn.
<div class="jp">隙間を挟んだ平行線です。各レーンは幅方向にずらされた独自の細いリボンなので、レーンは曲線に沿って進みます。塗りつぶした線から隙間を切り抜く方式では、ストロークが曲がっても隙間はまっすぐ走ったままになります。`lanes`は本数を、`duty`は各区画のうち描かれる割合を決めます。</div>


</div>
