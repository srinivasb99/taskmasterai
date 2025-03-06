import React, { useEffect, useRef } from 'react';

const MathJaxRenderer = ({ content }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (window.MathJax && containerRef.current) {
      window.MathJax.typesetPromise([containerRef.current]).catch((err) =>
        console.error('MathJax typeset failed:', err)
      );
    }
  }, [content]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: content }} />;
};

export default MathJaxRenderer;
