---
title: Palette
---

<div class="monologue">
Picking colors by hand produces sets that look chosen. Picking them by rule produces sets that look related.
<div class="jp">手で選んだ色は、選ばれたように見えます。規則で選んだ色は、関係し合っているように見えます。</div>
</div>

<div class="prose">

`Palette` is a list of colors with helpers for pulling entries out of it in a controlled way. It generates colors in OKLCH, so a fixed lightness reads as the same lightness across every hue.
<div class="jp">`Palette`は色のリストで、そこから色を規則立てて取り出すための補助メソッドを備えています。色はOKLCHで生成されるため、明度を固定すればどの色相でも同じ明るさに見えます。</div>

<div class="page-note">
<p><code>public/lib/Palette.js</code>, <code>public/lib/color.js</code> — copied from the stroke_designer project. <code>public/lib/ThemedPaletteMaker.js</code> builds on them.</p>
</div>

## Gamut

OKLCH describes colors sRGB cannot display. `maxChromaAt(L, H)` binary-searches the largest chroma that stays inside the sRGB gamut at a given lightness and hue, and generation never asks for more than that. `mostVibrantL(H)` scans for the lightness at which a hue reaches its highest chroma. Both live in `color.js`.
<div class="jp">OKLCHはsRGBでは表示できない色も表せます。`maxChromaAt(L, H)`は、指定した明度と色相でsRGBの色域に収まる最大の彩度を二分探索で求めます。生成処理がそれを超える値を使うことはありません。`mostVibrantL(H)`は、ある色相が最大の彩度に達する明度を走査して求めます。どちらも`color.js`にあります。</div>

## Generating

`Palette.fromHues(hues, options)` returns one entry per hue × luminosity step.
<div class="jp">`Palette.fromHues(hues, options)` は、色相と明度ステップの組み合わせごとに1つのエントリを返します。</div>

<div class="page-note">
<ul>
<li><code>nLum</code> — luminosity steps per hue. Default <code>4</code>.<br /><span class="jp">色相あたりの明度ステップ数。既定値は <code>4</code>。</span></li>
<li><code>lumHigh</code> / <code>lumLow</code> — the lightness range the steps span. Defaults <code>0.85</code> / <code>0.30</code>.<br /><span class="jp">ステップが分布する明度の範囲。既定値は<code>0.85</code>/<code>0.30</code>。</span></li>
<li><code>vibHigh</code> / <code>vibLow</code> — the ends of the chroma multiplier range. Defaults <code>0.95</code> / <code>0.30</code>. See Chroma below, since neither is applied directly.<br /><span class="jp">彩度の倍率の範囲の両端。既定値は <code>0.95</code> / <code>0.30</code>。どちらもそのまま適用されるわけではないため、下記のChromaを参照してください。</span></li>
</ul>
</div>

Steps are not spaced evenly between `lumLow` and `lumHigh`. The generator finds the lightness at which that hue reaches its maximum chroma (`mostVibrantL(H)`), snaps the nearest step to it, then redistributes the remaining steps on either side. Every hue therefore contributes one entry at the lightness where it can be most chromatic. That entry is not at the hue's maximum chroma, because the multiplier below applies to it like any other.
<div class="jp">ステップは `lumLow` と `lumHigh` の間に等間隔で配置されるわけではありません。生成処理は、その色相が最大彩度に達する明度を `mostVibrantL(H)` で求め、最も近いステップをそこにスナップさせたうえで、残りのステップを両側に配分し直します。そのため、どの色相にも、最も鮮やかになれる明度のエントリが1つ含まれます。ただしそのエントリは、他と同じように下記の倍率が掛かるため、色相の最大彩度そのものではありません。</div>

The first and last entries normally land exactly on `lumHigh` and `lumLow`. They do not when the snapped step is itself the first or last one, in which case that end takes the vibrant lightness and the requested bound is unused. At `nLum: 5, lumHigh: 0.88, lumLow: 0.28` this happens at hues 80, 90, 140, 150, 160, and 200.
<div class="jp">最初と最後のエントリは通常、ちょうど`lumHigh`と`lumLow`に置かれます。ただし、スナップされたステップが最初または最後のステップそのものである場合はそうなりません。そのときは、その端には最も鮮やかになる明度が入り、指定した境界値は使われません。`nLum: 5, lumHigh: 0.88, lumLow: 0.28` では、色相80、90、140、150、160、200でこれが起こります。</div>

## Chroma

Each entry starts from `maxChromaAt(L, H)` and takes a fraction of it. The fraction varies per entry, rising with how chromatic that lightness and hue could be.
<div class="jp">各エントリの彩度は、`maxChromaAt(L, H)`を基準に、その何割かを取った値です。この割合はエントリごとに異なり、その明度と色相がどれだけ鮮やかになれるかに応じて大きくなります。</div>

<div class="page-note">
<p><code>t = min(1, maxC / 0.4)</code><br />
<code>C = maxC × (vibLow + (vibHigh − vibLow) × t)</code></p>
</div>

0.4 is the reference for the most chromatic color the model expects to meet. `vibHigh` is therefore a ceiling rather than a setting: it applies only where `maxC` reaches 0.4, which sRGB does not do. At the defaults the largest fraction any entry takes is about 0.78, and no entry anywhere in the palette sits at its own `maxC`.
<div class="jp">0.4は、このモデルが想定する最も鮮やかな色の基準値です。したがって `vibHigh` は設定値というより上限です。これが適用されるのは `maxC` が0.4に達する場合だけであり、sRGBではそこに届きません。既定値では、エントリに掛かる割合は最大でもおよそ0.78で、パレットのどのエントリも自身の`maxC`には達しません。</div>

The multiplier rises with `maxC`, so the entry with the most headroom stays the most chromatic of its row. Setting `vibLow` above `vibHigh` inverts that relationship and the ordering no longer holds.
<div class="jp">倍率は `maxC` とともに大きくなるため、余裕が最も大きいエントリが行のなかで最も鮮やかなままになります。`vibLow` を `vibHigh` より大きく設定するとこの関係が反転し、その順序は保たれなくなります。</div>

Two other constructors take colors that already exist: `fromHexArray(hexes)` for plain strings, and `fromEntries(entries)` for objects that already carry `L`, `C`, and `H`.
<div class="jp">既存の色を受け取るコンストラクタも2つあります。単純な文字列の配列には `fromHexArray(hexes)`、`L`・`C`・`H` をすでに持つオブジェクトには `fromEntries(entries)` を使います。</div>

## ThemedPaletteMaker

`ThemedPaletteMaker` generates a `Palette` from three inputs: a key hue, a color count, and a theme. The theme decides everything else: which hues are used, and how light and how saturated each color is. `new ThemedPaletteMaker({ hue, count, theme, seed }).generate()` returns a regular `Palette`, with the key color first.
<div class="jp">`ThemedPaletteMaker`は、3つの入力から`Palette`を生成します。基準の色相、色数、テーマです。それ以外はすべてテーマが決めます。どの色相を使うか、そして各色の明るさと彩度です。`new ThemedPaletteMaker({ hue, count, theme, seed }).generate()`は通常の`Palette`を返し、基準の色が先頭に来ます。</div>

<div class="page-note">
<ul>
<li><code>mono</code> — every color at the key hue. The first at the hue's most vibrant point, the rest dividing L as evenly as that fixed first color allows, each at the largest chroma available.<br /><span class="jp">すべての色は基準の色相に揃えられます。最初の色は、その色相が最も鮮やかになる点に配置され、残りの色は、その最初の色が許す範囲で明度の幅を均等に分割して配置します。彩度は、各明度で取りうる最大値です。</span></li>
<li><code>vivid-dark</code> — the whole wheel divided evenly from the key hue; the half nearest the key hue vivid at each hue's representative lightness, the far half dark.<br /><span class="jp">色相環全体を基準の色相から均等に分割します。基準に近い半分は各色相の代表的な明度で鮮やかな色になり、遠い半分は暗い色になります。</span></li>
<li><code>pastel-cluster</code> — hues clustered around the key hue, all light and low in chroma.<br /><span class="jp">色相を基準の色相のまわりに集め、すべて明るく、彩度の低い色にします。</span></li>
<li><code>dark-cluster</code> — the same clustering, tighter, every color dark.<br /><span class="jp">同じクラスタをより狭くし、すべての色を暗くしたものです。</span></li>
<li><code>vivid-wheel</code> — the whole wheel divided evenly, every color at its own hue's most vibrant point.<br /><span class="jp">色相環全体を均等に分割し、各色をその色相が最も鮮やかになる点に配置します。</span></li>
<li><code>black</code> — every color black.<br /><span class="jp">すべての色が黒です。</span></li>
</ul>
</div>

Every theme except `black` jitters the hue and lightness of the colors other than the key color. The jitter derives from `seed`, so the same settings reproduce the same palette. `PALETTE_THEMES` lists the themes with display labels.
<div class="jp">`black`を除くすべてのテーマは、基準の色以外の色相と明度を揺らします。揺らぎは`seed`から導かれるため、同じ設定からは同じパレットが再現されます。`PALETTE_THEMES`は表示名付きのテーマの一覧です。</div>

`representativeL(H)` is the lightness of a hue's most prototypical color, the one people recognize by the simplest color term (red, green, blue, pink). That color sits at a particular lightness, not at the hue's max-chroma point: yellow is only yellow when bright, while green and blue are their names well below their chroma peaks. Anchored per color term (red 0.58, orange 0.72, yellow 0.90, yellow-green 0.82, green 0.50, cyan 0.70, blue 0.45, purple 0.45, magenta 0.58, pink 0.78) and interpolated around the wheel. The prototypes are cultural: which terms are basic, and where their colors sit, varies between cultures, and the anchors are one such choice.
<div class="jp">`representativeL(H)`は、その色相の最も典型的な色の明度です。赤、緑、青、ピンクといった、いちばん単純な色名で誰もが思い浮かべる色です。その色は特定の明度にあり、色相の彩度が最大になる点とは一致しません。黄色は明るいときだけ黄色であり、緑や青は、彩度のピークよりずっと低い明度でその名前の色になります。色名ごとの基準値（赤0.58、橙0.72、黄0.90、黄緑0.82、緑0.50、シアン0.70、青0.45、紫0.45、マゼンタ0.58、ピンク0.78）を色相環に沿って補間します。この典型は文化に依存します。どの色名が基本になるか、その色がどこにあるかは文化によって異なり、この基準値はそのひとつの選択です。</div>

Two helpers support the demos: `paperColor(hue)` returns a near-white paper tint of a hue for a background, and `randomThemedPalette(theme, count)` returns a themed palette at a random key hue and seed.
<div class="jp">デモ用の補助が2つあります。`paperColor(hue)`は、背景用に、その色相をわずかに帯びた白に近い紙のような色を返します。`randomThemedPalette(theme, count)`は、ランダムな基準色相とシードでテーマ付きパレットを返します。</div>

## Selecting

<div class="page-note">
<ul>
<li><code>spread(n)</code> — <code>n</code> entries evenly distributed across the palette. Every hue and step stays represented no matter how many entries the settings produced.<br /><span class="jp">パレット全体から等間隔に<code>n</code>個のエントリを取ります。設定によってエントリ数がどう変わっても、すべての色相とステップが漏れなく含まれます。</span></li>
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
