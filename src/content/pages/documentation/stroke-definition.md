---
title: Stroke Definition
---

<div class="monologue">
A stroke knows where it goes and how wide it is. It does not know what it looks like.
<div class="jp">ストロークは、自分がどこを通り、どれだけの幅を持つかを知っています。しかし、自分がどう見えるかは知りません。</div>
</div>

<div class="prose">

`StrokeDef` is the whole definition of one stroke: an array of points, a width on each side of those points, and a reference to the renderer that turns the two into geometry. Splitting it this way means the same path can be drawn as a hard-edged ribbon, a tapered brush mark, or a volumetric tube by swapping one field.
<div class="jp">`StrokeDef` は、一本のストロークの定義そのものです。点の配列、その点の左右それぞれの幅、そしてその二つをジオメトリに変換するレンダラへの参照。このように分けておくと、同じパスを、硬い輪郭のリボンとしても、先細りの筆跡としても、立体的なチューブとしても描けます。変えるのはフィールド一つだけです。</div>

<div class="page-note">
<p><code>public/lib/StrokeDef.js</code></p>
</div>

## StrokeDef

Constructed from a single options object.
<div class="jp">単一のオプションオブジェクトから構築します。</div>

<div class="page-note">
<ul>
<li><code>points</code> — <code>THREE.Vector3[]</code>. Control points, not final vertices. Renderers treat them as a centripetal Catmull-Rom curve and resample it; two points are the minimum.<br /><span class="jp">制御点であり、最終的な頂点ではありません。レンダラはこれを centripetal Catmull-Rom 曲線として扱い、再サンプリングします。最低2点が必要です。</span></li>
<li><code>widthLeft</code> — width on the left of the spine. Default <code>0.02</code>.<br /><span class="jp">スパイン（芯線）の左側の幅。既定値は <code>0.02</code>。</span></li>
<li><code>widthRight</code> — width on the right. Defaults to <code>widthLeft</code>, giving a symmetric stroke.<br /><span class="jp">右側の幅。省略すると <code>widthLeft</code> と同じ値になり、左右対称のストロークになります。</span></li>
<li><code>renderer</code> — the <code>StrokeRenderer</code> used by <code>build()</code>.<br /><span class="jp"><code>build()</code> が使用する <code>StrokeRenderer</code>。</span></li>
</ul>
</div>

"Left" is the +90° rotation of the tangent in the XY plane. Because the two sides are stored separately, a stroke can lean off the path that generated it — the spine stays where the gesture put it while the visible mark thickens to one side.
<div class="jp">「左」とは、XY平面上で接線を+90°回転させた向きです。左右を別々に保持しているため、ストロークは自分を生成したパスから偏ることができます。スパインは身振りが置いた位置に留まったまま、目に見える線だけが片側に太っていきます。</div>

`build()` hands the definition to its renderer and returns a `THREE.Object3D`. `maxWidth()` samples both sides and returns the largest value; `polylineLength` measures the control polygon, which is a cheap approximation renderers do not rely on — they measure the resampled curve instead.
<div class="jp">`build()` は定義をレンダラに渡し、`THREE.Object3D` を返します。`maxWidth()` は左右をサンプリングして最大値を返します。`polylineLength` は制御点を結んだ折れ線の長さで、これは安価な近似値であり、レンダラはこれに依存せず、再サンプリングした曲線を計測します。</div>

## Width

A width is one of three things, resolved by `resolveWidth(width, t)` where `t` runs 0 → 1 over arc length.
<div class="jp">幅は次の3つのいずれかで表され、`resolveWidth(width, t)` によって解決されます。`t` は弧長に沿って 0 から 1 まで進みます。</div>

<div class="page-note">
<ul>
<li><strong>number</strong> — constant along the stroke.<br /><span class="jp">ストローク全体で一定。</span></li>
<li><strong>number[]</strong> — sampled evenly along the stroke and linearly interpolated between entries. Useful for recorded pressure.<br /><span class="jp">ストロークに沿って等間隔にサンプリングされ、値の間は線形補間されます。記録した筆圧などに向いています。</span></li>
<li><strong>(t) =&gt; number</strong> — evaluated per sample. Useful for analytic profiles.<br /><span class="jp">サンプルごとに評価されます。解析的なプロファイルに向いています。</span></li>
</ul>
</div>

Because `t` is normalised over *arc length* rather than over the control point index, a width profile keeps its shape when the control points are unevenly spaced. A taper written as `sin(πt)` peaks at the halfway point of the drawn mark, not at the middle entry of the array.
<div class="jp">`t` は制御点のインデックスではなく<em>弧長</em>で正規化されているため、制御点の間隔が不均一でも幅のプロファイルは形を保ちます。`sin(πt)` と書いた先細りは、配列の真ん中の要素ではなく、描かれた線の長さの中間で最大になります。</div>

## The renderer reference

`renderer` is a reference, not a subclass hook: one renderer instance can build any
number of strokes, because it carries style and never state about a particular stroke.
`build()` simply hands the definition over.
<div class="jp">`renderer` はサブクラス用のフックではなく参照です。レンダラのインスタンスは任意の数のストロークを構築できます。保持するのはスタイルであって、特定のストロークの状態ではないからです。`build()` は単に定義を渡すだけです。</div>

Renderers, the contract they share, and `RibbonStrokeRenderer` are documented on
<a href="/draw/documentation/renderers">Renderers</a>.
<div class="jp">レンダラ、レンダラ同士が共有する契約、そして `RibbonStrokeRenderer` については<a href="/draw/documentation/renderers">Renderers</a>に記載しています。</div>

</div>
