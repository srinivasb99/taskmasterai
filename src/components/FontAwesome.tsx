// src/components/FontAwesome.tsx
import { library } from '@fortawesome/fontawesome-svg-core';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

library.add(fab);

export const FaIcon = ({ icon, ...props }: any) => (
  <FontAwesomeIcon icon={['fab', icon]} {...props} />
);
