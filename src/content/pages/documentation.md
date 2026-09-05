---
title: Documentation
---

<div class="monologue">
The demos are disposable. The classes underneath them are not.
<div class="jp">デモは使い捨てで構いません。その下にあるクラスはそうではありません。</div>
</div>

<div class="prose">

Every demo on this site is a thin harness over a shared library. A demo composes classes, wires up controls, and renders; it owns no drawing logic of its own. This section documents the library — the contracts, the parameters, and why they are shaped the way they are.
<div class="jp">このサイトのデモはすべて、共有ライブラリの上に載った薄い足場に過ぎません。デモはクラスを組み合わせ、コントロールを繋ぎ、描画するだけで、描画のロジック自体は持ちません。このセクションでは、そのライブラリ、つまり各クラスの契約とパラメータ、そしてなぜそういう形になっているのかを記録します。</div>

Each major class, or each group of closely related classes, gets its own page. Behaviour shared across a group is written down once on that group's page rather than repeated per class, so that adding a new member to the group means checking it against a single list.
<div class="jp">主要なクラス、あるいは密接に関連するクラスのグループごとに、専用のページを設けます。グループ内で共有される振る舞いは、クラスごとに繰り返さず、そのグループのページに一度だけ記述します。こうしておけば、グループに新しいメンバーを加えるときは、一つのリストと照合するだけで済みます。</div>

## Pages

<ul>
<li><a href="/draw/documentation/stroke-definition"><strong>Stroke Definition</strong></a> — <code>StrokeDef</code>: the points, the width model, and the renderer reference.<br /><span class="jp"><code>StrokeDef</code>。点の配列、幅のモデル、そしてレンダラへの参照。</span></li>
<li><a href="/draw/documentation/renderers"><strong>Renderers</strong></a> — the contract every stroke renderer honours, and <code>RibbonStrokeRenderer</code>.<br /><span class="jp">すべてのストロークレンダラが従う契約と、<code>RibbonStrokeRenderer</code>。</span></li>
<li><a href="/draw/documentation/curves"><strong>Curves</strong></a> — natural and Hobby curve constructions over resampled knots.<br /><span class="jp">再サンプリングしたノット上のnatural曲線とHobby曲線の構築。</span></li>
<li><a href="/draw/documentation/path-effects"><strong>Path Effects</strong></a> — generators that derive new paths from a base path.<br /><span class="jp">元のパスから新しいパスを導く生成器。</span></li>
<li><a href="/draw/documentation/palette"><strong>Palette</strong></a> — OKLCH palette generation and selection.<br /><span class="jp">OKLCHによるパレットの生成と選択。</span></li>
<li><a href="/draw/documentation/drawing-tool"><strong>Drawing Tool</strong></a> — the reusable instrument: <code>setupDrawingTool</code>, the tool registry, and the mark builder.<br /><span class="jp">再利用可能な楽器。<code>setupDrawingTool</code>、ツールレジストリ、そしてマークビルダー。</span></li>
<li><a href="/draw/documentation/player"><strong>Player</strong></a> — the drawing log, and the standalone playback and recording engine.<br /><span class="jp">描画のログと、独立した再生・録画エンジン。</span></li>
<li><a href="/draw/documentation/writing-style"><strong>Writing Style</strong></a> — the conventions every explanation on this site follows.<br /><span class="jp">このサイトのすべての説明が従う規約。</span></li>
</ul>

## Layout

<div class="page-note">
<p><code>public/lib/</code> holds library code. <code>public/demos/&lt;name&gt;/</code> holds demos. Demos import from the library by relative path; the library never imports from a demo.</p>
<span class="jp"><code>public/lib/</code> にライブラリのコード、<code>public/demos/&lt;name&gt;/</code> に各デモを置きます。デモは相対パスでライブラリを読み込みますが、ライブラリがデモを読み込むことはありません。</span>
<p>Documentation pages describe the library only. What a particular demo does, and what it taught us, stays on that demo's own page.</p>
<span class="jp">ドキュメントのページはライブラリについてのみ記述します。個々のデモが何をしていて、そこから何が分かったかは、そのデモ自身のページに残します。</span>
</div>

</div>
