---
title: Curves
---

<div class="prose">

Curve constructions over a list of knots. Each takes points and returns a dense polyline through them. They pair with `resampleEvery`: pick knots from a drawn path at a fixed span, then connect them with one of these, and the wobble of the hand disappears between the knots.
<div class="jp">ノットの列の上に曲線を構築します。それぞれ点を受け取り、その点を通る密なポリラインを返します。`resampleEvery`と組み合わせて使います。描かれたパスから一定のスパンでノットを取り、これらの曲線でつなぐと、手の揺れはノットの間で消えます。</div>

<div class="page-note">
<p><code>public/lib/curves.js</code></p>
</div>

## resampleEvery

Points spaced `span` apart along the polyline, walked by arc length. The first and last points are always kept, so the curve starts and ends where the path did.
<div class="jp">ポリラインに沿って弧長基準で`span`間隔に置かれた点です。最初と最後の点は常に保持されるため、曲線はパスと同じ場所で始まり、終わります。</div>

## naturalSpline

A natural cubic spline through the knots: C2 continuous, with zero second derivative at the ends. Parameterized by chord length, so uneven knot spacing does not distort the shape. Takes `samplesPerSegment`.
<div class="jp">ノットを通るnatural 3次スプラインです。C2連続で、両端の2階微分はゼロです。弦長でパラメータ化するため、ノットの間隔が不均一でも形は歪みません。`samplesPerSegment`を受け取ります。</div>

## hobbyCurve

John Hobby's curve through the knots, the interpolation METAFONT draws paths with. Tangent directions come from a mock-curvature linear system solved with the Thomas algorithm, and control handles from Hobby's velocity function. Adapted from Jake Low's implementation (ISC license). Takes `samplesPerSegment` and `omega`, the curl at the endpoints.
<div class="jp">ノットを通るJohn Hobbyの曲線で、METAFONTがパスを描くのに使う補間です。接線方向は擬似曲率の連立方程式をThomasアルゴリズムで解いて求め、制御ハンドルはHobbyの速度関数から求めます。Jake Lowの実装（ISCライセンス）を基にしています。`samplesPerSegment`と、端点でのカールである`omega`を受け取ります。</div>

It swings wider through corners than the natural spline. The natural spline minimizes bending energy along the whole curve, while Hobby's construction aims for locally even curvature, which rounds a corner into a fuller arc.
<div class="jp">角ではnaturalスプラインより大きく膨らみます。naturalスプラインは曲線全体の曲げエネルギーを最小化しますが、Hobbyの構築は局所的に均一な曲率を目指すため、角はより丸いふくらみを持った弧になります。</div>

</div>
