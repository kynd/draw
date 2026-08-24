---
title: Writing Style
---

<div class="prose">

The conventions every explanation on this site follows. Extracted from edits made to drafted text, so each rule is a correction that was actually needed rather than a preference stated in advance.
<div class="jp">このサイトのすべての説明が従う規約です。下書きに対して実際に加えられた修正から抽出しているため、それぞれの規則は、あらかじめ表明された好みではなく、実際に必要だった訂正です。</div>

## Punctuation

Do not use em-dashes for asides. Use parentheses for a gloss or an example, a comma for a trailing clause, or a full stop to start a new sentence.
<div class="jp">補足に em ダッシュを使わないでください。語句の補足や例には丸括弧を、後続の従属節にはカンマを、それ以外は文を分けて句点を使います。</div>

<div class="page-note">
<p><strong>Not:</strong> Colors are generated in OKLCH — lightness, chroma, hue — rather than RGB.<br />
<strong>But:</strong> Colors are generated in OKLCH (lightness, chroma, hue) rather than RGB.</p>
<p><strong>Not:</strong> …not absolute saturations — which is why increasing Most never pushes a color out of gamut.<br />
<strong>But:</strong> …not absolute saturations, which is why increasing Most never pushes a color out of gamut.</p>
<p><strong>Not:</strong> …at a particular lightness — yellows near the top, blues much lower — and the generator finds that lightness.<br />
<strong>But:</strong> …at a particular lightness: yellows near the top, blues much lower. The generator finds that lightness.</p>
</div>

A colon introduces an example or a list. When an aside would make a sentence run long, end the sentence and start another.
<div class="jp">コロンは例や列挙を導きます。補足によって文が長くなる場合は、そこで文を終えて次の文を始めます。</div>

## Sentences

Keep the relative pronoun. Write "colors that sRGB cannot display", not "colors sRGB cannot display".
<div class="jp">関係代名詞は省略しません。"colors sRGB cannot display" ではなく "colors that sRGB cannot display" と書きます。</div>

Lead with the action rather than the condition around it.
<div class="jp">動作を先に置き、その周辺の条件を後に回します。</div>

<div class="page-note">
<p><strong>Not:</strong> In HSL, holding saturation and lightness fixed while sweeping hue produces colors of wildly different brightness.<br />
<strong>But:</strong> In HSL, sweeping the hue while keeping saturation and lightness fixed can produce colors with very different brightness.</p>
</div>

Hedge a claim that only holds sometimes. "Can produce" where the outcome depends on which hues are involved; "produces" only where it always does.
<div class="jp">条件によっては成り立たない主張には、断定を避けた表現を使います。結果が色相に依存する場合は "can produce"、常にそうなる場合にのみ "produces" を使います。</div>

## Words

American spelling throughout: color, toward, behavior.
<div class="jp">綴りは一貫してアメリカ式にします。color、toward、behavior。</div>

Plain verbs over dramatic ones. Cut intensifiers that add heat but no information.
<div class="jp">大げさな動詞よりも平易な動詞を使います。熱量だけを足して情報を足さない強調語は削ります。</div>

<div class="page-note">
<p><strong>Not:</strong> wildly different · yellow leaps out · that is where yellow can be vivid at all<br />
<strong>But:</strong> very different · yellow pops · that’s the only place yellow can be vivid</p>
</div>

Name the noun instead of using an adjective as one: "at that hue’s most saturated point", not "at that hue’s most saturated".
<div class="jp">形容詞を名詞の代わりに使わず、名詞を明示します。"at that hue's most saturated" ではなく "at that hue's most saturated point"。</div>

Contractions are fine. "That’s the only place" reads better than "that is where".
<div class="jp">短縮形を使って構いません。"that is where" よりも "that's the only place" のほうが読みやすくなります。</div>

## Scope

Describe features of the library. Do not describe the arbitrary decisions of a demo: the shape of its test path, its taper constants, how its colors happen to be picked, or plumbing the reader does not act on. A demo decision is worth a sentence only when the demo would mislead without it.
<div class="jp">ライブラリの機能を記述してください。デモの恣意的な決定は記述しません。テスト用パスの形、先細りの係数、色のたまたまの選び方、読者が関与しない内部の配管などです。デモの決定に一文を割く価値があるのは、それがないとデモが誤解を招く場合だけです。</div>

<div class="page-note">
<p><strong>Cut:</strong> Each path runs straight for its first third, then wiggles. The amplitude is held at zero and eased in with a smoothstep…<br />
<strong>Cut:</strong> …the background from the light end, the strokes from the dark end, grouped by hue so two strokes never come back as near-identical shades.<br />
<strong>Kept:</strong> The sample count is derived from measured arc length, not from how many control points the path was authored with.</p>
</div>

The kept example survives because it states what the library does with any path. The cut examples describe one demo's inputs, which the reader can neither reuse nor act on.
<div class="jp">残した例は、ライブラリがどんなパスに対しても行うことを述べているため生き残ります。削った例はひとつのデモへの入力の説明であり、読者はそれを再利用することも、それに基づいて行動することもできません。</div>

## Endings

Stop when the fact is stated. Do not append a clause explaining why the fact matters, or restating it in other words.
<div class="jp">事実を述べ終えたら止めます。その事実がなぜ重要かを説明する節や、言い換えて繰り返す節を付け足さないでください。</div>

<div class="page-note">
<p><strong>Not:</strong> OKLCH is built so a fixed lightness reads as a fixed lightness across every hue, which is what lets a column of the grid hold together as a column.<br />
<strong>But:</strong> OKLCH is designed so that a fixed lightness reads as a consistent lightness across hues.</p>
</div>

That example also shows the rhetorical repetition to avoid — "a fixed lightness reads as a fixed lightness", "hold together as a column". Repeating a word for effect reads as a flourish. Vary the second use, or cut the clause.
<div class="jp">この例は、避けるべき修辞的な反復も示しています。"a fixed lightness reads as a fixed lightness"、"hold together as a column"。効果を狙った語の反復は、飾りとして読まれます。二度目の語を変えるか、その節を削ってください。</div>

## Openings

Open a page with a plain description of what the thing is. Not an aphorism, not a hook, not a first-person musing.
<div class="jp">ページの冒頭は、それが何であるかの平易な説明にします。警句でも、引きでも、一人称の独白でもありません。</div>

<div class="page-note">
<p><strong>Not:</strong> Before deciding what a mark looks like, decide what colors exist.<br />
<strong>But:</strong> A reusable palette class that distributes colors using the OKLCH model</p>
</div>

## Headings

A short noun phrase naming the topic. Not a question, not a clause, not an evocative phrase.
<div class="jp">見出しは、主題を示す短い名詞句にします。疑問文でも、節でも、含みを持たせた表現でもありません。</div>

<div class="page-note">
<p><strong>Not:</strong> How the palette is built · Where the lightness steps land<br />
<strong>But:</strong> Color Selection · Distribution of the steps</p>
</div>

## Japanese

Every English paragraph is followed by its Japanese counterpart in a `<div class="jp">`. The Japanese mirrors the English structure, parentheses included.
<div class="jp">英語の段落には必ず、対応する日本語を `<div class="jp">` で続けます。日本語は括弧の使い方を含めて英語の構造を反映させます。</div>

Use full-width parentheses （） for asides, with the plain form inside: 見かけの明るさが大きく変わってしまいます（黄色は飛び出し、青は沈む）。
<div class="jp">補足には全角括弧（）を使い、その中は常体にします。</div>

Prefer the active or potential form over the passive.
<div class="jp">受身よりも能動形・可能形を優先します。</div>

<div class="page-note">
<p><strong>Not:</strong> スウォッチをクリックすると16進数の値がコピーされます。<br />
<strong>But:</strong> スウォッチをクリックすると16進数（hex）をコピーできます。</p>
</div>

Gloss a technical term on first use: 16進数（hex）.
<div class="jp">専門用語には初出時に原語を添えます。16進数（hex）。</div>

No spaces around inline markup in Japanese text: `Chromaの<strong>Most</strong>と<strong>Least</strong>は` — not `Chromaの <strong>Most</strong> と`.
<div class="jp">日本語のなかのインライン要素の前後に空白を入れません。`Chromaの <strong>Most</strong> と` ではなく `Chromaの<strong>Most</strong>と<strong>Least</strong>は`。</div>

</div>
