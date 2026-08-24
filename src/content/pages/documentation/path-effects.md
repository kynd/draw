---
title: Path Effects
---

<div class="prose">

Generators that derive new paths from a base path. Each takes an array of control points and returns one or more new point arrays, ready to hand to a `StrokeDef`. They know nothing about renderers: the derived paths are ordinary paths, drawn by whatever renderer the caller picks.
<div class="jp">元のパスから新しいパスを導く生成器です。それぞれ制御点の配列を受け取り、`StrokeDef`にそのまま渡せる点の配列をひとつ以上返します。レンダラについては何も知りません。導かれたパスは通常のパスであり、呼び出し側が選んだレンダラで描かれます。</div>

<div class="page-note">
<p><code>public/lib/pathEffects.js</code></p>
</div>

All randomness is seeded, so the same seed returns the same paths.
<div class="jp">ランダム性はすべてシード付きで、同じシードからは同じパスが返ります。</div>

## spiralPath

The tip circles with sin and cos while its center moves along the base path, returning one continuous coil. Takes `turns`, `radius`, and `count` (output points, since a spiral needs far more than its base).
<div class="jp">中心が元のパスに沿って進むあいだ、先端がsinとcosで円を描き、一本の連続したコイルを返します。`turns`、`radius`、`count`（出力点数。スパイラルには元のパスよりはるかに多くの点が必要です）を受け取ります。</div>

## entangledPaths

Copies of the path, each offset by its own seeded low-frequency waves. Endpoints pull back toward the base so the bundle reads as one gesture. Takes `count`, `amplitude`, `waves`, and `seed`.
<div class="jp">パスの複製で、それぞれが独自のシード付き低周波の波でずらされます。端点は元のパスへ引き戻されるため、束はひとつの身振りとして読めます。`count`、`amplitude`、`waves`、`seed`を受け取ります。</div>

## scatteredPaths

Short strokes that copy small segments of the base and move sideways by a seeded offset. Takes `count`, `length`, `offset`, and `seed`.
<div class="jp">元のパスの一部を写し取り、シード付きのオフセットで横へ移動する短いストロークです。`count`、`length`、`offset`、`seed`を受け取ります。</div>

</div>
