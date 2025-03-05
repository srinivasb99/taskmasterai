// hooks/useIlluminateMode.ts
import { useState, useEffect } from 'react';

export function useIlluminateMode() {
  // Load initial state from localStorage
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  useEffect(() => {
    // Store updated value in localStorage
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));

    // Toggle the illuminate-mode class on the <body>
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
    }
  }, [isIlluminateEnabled]);

  // Return a tuple, same pattern as your useBlackoutMode hook
  return [isIlluminateEnabled, setIsIlluminateEnabled] as const;
}
