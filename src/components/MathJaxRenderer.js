import React from 'react';
import { MathJax, MathJaxContext } from 'better-react-mathjax';

const MathJaxRenderer = ({ content }) => {
  const config = {
    loader: { load: ['input/tex', 'output/chtml'] },
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
  };

  return (
    <MathJaxContext version={3} config={config}>
      <MathJax dynamic>{content}</MathJax>
    </MathJaxContext>
  );
};

export default MathJaxRenderer;
