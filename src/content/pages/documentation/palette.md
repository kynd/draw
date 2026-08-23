---
title: Palette
---

<div class="monologue">
Picking colors by hand produces sets that look chosen. Picking them by rule produces sets that look related.
<div class="jp">手で選んだ色は、選ばれたように見えます。規則で選んだ色は、関係し合っているように見えます。</div>
</div>

<div class="prose">

`Palette` is a list of colors with helpers for pulling entries out of it in a controlled way. It generates colors in OKLCH, so a fixed lightness reads as the same lightness across every hue.
<div class="jp">`Palette` は色のリストであり、そこから制御された形で色を取り出すための補助メソッドを備えています。色はOKLCHで生成されるため、明度を固定すればどの色相でも同じ明るさに見えます。</div>

<div class="page-note">
<p><code>public/lib/Palette.js</code>, <code>public/lib/color.js</code> — copied from the stroke_designer project.</p>
</div>

## Gamut

OKLCH describes colors sRGB cannot display. `maxChromaAt(L, H)` binary-searches the largest chroma that stays inside the sRGB gamut at a given lightness and hue, and generation never asks for more than that. `mostVibrantL(H)` scans for the lightness at which a hue reaches its highest chroma. Both live in `color.js`.
<div class="jp">OKLCHはsRGBで表示できない色も記述します。`maxChromaAt(L, H)` は、指定した明度と色相においてsRGBの色域に収まる最大の彩度を二分探索で求め、生成処理はそれを超える値を要求しません。`mostVibrantL(H)` は、ある色相が最大彩度に達する明度を走査します。どちらも `color.js` にあります。</div>

## Generating

`Palette.fromHues(hues, options)` returns one entry per hue × luminosity step.
<div class="jp">`Palette.fromHues(hues, options)` は、色相と明度ステップの組み合わせごとに1つのエントリを返します。</div>

<div class="page-note">
<ul>
<li><code>nLum</code> — luminosity steps per hue. Default <code>4</code>.<br /><span class="jp">色相あたりの明度ステップ数。既定値は <code>4</code>。</span></li>
<li><code>lumHigh</code> / <code>lumLow</code> — the lightness range the steps span. Defaults <code>0.85</code> / <code>0.30</code>.<br /><span class="jp">ステップが広がる明度の範囲。既定値は <code>0.85</code> / <code>0.30</code>。</span></li>
<li><code>vibHigh</code> / <code>vibLow</code> — the ends of the chroma multiplier range. Defaults <code>0.95</code> / <code>0.30</code>. See Chroma below, since neither is applied directly.<br /><span class="jp">彩度の倍率の範囲の両端。既定値は <code>0.95</code> / <code>0.30</code>。どちらもそのまま適用されるわけではないため、下記のChromaを参照してください。</span></li>
</ul>
</div>

Steps are not spaced evenly between `lumLow` and `lumHigh`. The generator finds the lightness at which that hue reaches its maximum chroma (`mostVibrantL(H)`), snaps the nearest step to it, then redistributes the remaining steps on either side. Every hue therefore contributes one entry at the lightness where it can be most chromatic. That entry is not at the hue's maximum chroma, because the multiplier below applies to it like any other.
<div class="jp">ステップは `lumLow` と `lumHigh` の間に等間隔で配置されるわけではありません。生成処理は、その色相が最大彩度に達する明度を `mostVibrantL(H)` で求め、最も近いステップをそこにスナップさせたうえで、残りのステップを両側に配分し直します。そのため、どの色相も、最も鮮やかになれる明度のエントリを1つ持ちます。ただしそのエントリは、他と同じように下記の倍率が掛かるため、色相の最大彩度そのものではありません。</div>

The first and last entries normally land exactly on `lumHigh` and `lumLow`. They do not when the snapped step is itself the first or last one, in which case that end takes the vibrant lightness and the requested bound is unused. At `nLum: 5, lumHigh: 0.88, lumLow: 0.28` this happens at hues 80, 90, 140, 150, 160, and 200.
<div class="jp">最初と最後のエントリは通常、ちょうど `lumHigh` と `lumLow` に着地します。ただし、スナップされたステップが最初または最後のステップそのものである場合はそうなりません。そのときは、その端が最も鮮やかな明度を取り、指定した境界値は使われません。`nLum: 5, lumHigh: 0.88, lumLow: 0.28` では、色相80、90、140、150、160、200でこれが起こります。</div>

## Chroma

Each entry starts from `maxChromaAt(L, H)` and takes a fraction of it. The fraction varies per entry, rising with how chromatic that lightness and hue could be.
<div class="jp">各エントリは `maxChromaAt(L, H)` を起点に、その一部を取ります。この割合はエントリごとに異なり、その明度と色相がどれだけ鮮やかになれるかに応じて大きくなります。</div>

<div class="page-note">
<p><code>t = min(1, maxC / 0.4)</code><br />
<code>C = maxC × (vibLow + (vibHigh − vibLow) × t)</code></p>
</div>

0.4 is the reference for the most chromatic color the model expects to meet. `vibHigh` is therefore a ceiling rather than a setting: it applies only where `maxC` reaches 0.4, which sRGB does not do. At the defaults the largest fraction any entry takes is about 0.78, and no entry anywhere in the palette sits at its own `maxC`.
<div class="jp">0.4は、このモデルが想定する最も鮮やかな色の基準値です。したがって `vibHigh` は設定値というより上限です。これが適用されるのは `maxC` が0.4に達する場合だけであり、sRGBではそこに届きません。既定値では、どのエントリが取る割合も最大でおよそ0.78で、パレット内のどのエントリも自身の `maxC` には達しません。</div>

The multiplier rises with `maxC`, so the entry with the most headroom stays the most chromatic of its row. Setting `vibLow` above `vibHigh` inverts that relationship and the ordering no longer holds.
<div class="jp">倍率は `maxC` とともに大きくなるため、余裕が最も大きいエントリが行のなかで最も鮮やかなままになります。`vibLow` を `vibHigh` より大きく設定するとこの関係が反転し、その順序は保たれなくなります。</div>

Two other constructors take colors that already exist: `fromHexArray(hexes)` for plain strings, and `fromEntries(entries)` for objects that already carry `L`, `C`, and `H`.
<div class="jp">既存の色を受け取るコンストラクタも2つあります。単純な文字列の配列には `fromHexArray(hexes)`、`L`・`C`・`H` をすでに持つオブジェクトには `fromEntries(entries)` を使います。</div>

## Selecting

<div class="page-note">
<ul>
<li><code>spread(n)</code> — <code>n</code> entries evenly distributed across the palette. Every hue and step stays represented no matter how many entries the settings produced.<br /><span class="jp">パレット全体から等間隔に <code>n</code> 個のエントリを取ります。設定によってエントリ数がどう変わっても、すべての色相とステップが代表されます。</span></li>
<li><code>sample(t)</code> — the entry at fractional position <code>t</code>.<br /><span class="jp">位置 <code>t</code>（0〜1）にあるエントリ。</span></li>
<li><code>pickPair(i)</code> — an entry and its counterpart roughly half-way round the palette, for a two-color gradient. Deterministic when <code>i</code> is given.<br /><span class="jp">あるエントリと、パレット上でほぼ半周先にあるエントリの組。2色のグラデーション用です。<code>i</code> を指定すれば決定論的になります。</span></li>
<li><code>pick()</code> — a random entry.<br /><span class="jp">ランダムなエントリ。</span></li>
<li><code>toHexArray()</code>, <code>entries</code>, <code>length</code> — the raw list.<br /><span class="jp">生のリストへのアクセス。</span></li>
</ul>
</div>

<div class="page-note">
<p><code>pick()</code> and a bare <code>pickPair()</code> call <code>Math.random()</code>. Pass an index to <code>pickPair(i)</code> for a deterministic result.</p>
<span class="jp"><code>pick()</code> と引数なしの <code>pickPair()</code> は <code>Math.random()</code> を呼びます。決定論的な結果が必要な場合は <code>pickPair(i)</code> にインデックスを渡してください。</span>
</div>

</div>
