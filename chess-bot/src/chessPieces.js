import wP from './assets/pieces/wP.svg';
import wN from './assets/pieces/wN.svg';
import wB from './assets/pieces/wB.svg';
import wR from './assets/pieces/wR.svg';
import wQ from './assets/pieces/wQ.svg';
import wK from './assets/pieces/wK.svg';
import bP from './assets/pieces/bP.svg';
import bN from './assets/pieces/bN.svg';
import bB from './assets/pieces/bB.svg';
import bR from './assets/pieces/bR.svg';
import bQ from './assets/pieces/bQ.svg';
import bK from './assets/pieces/bK.svg';

const PIECE_IMAGES = {
  wP, wN, wB, wR, wQ, wK,
  bP, bN, bB, bR, bQ, bK
};

export function getPieceImg(color, type) {
  const code = `${color}${type.toUpperCase()}`;
  return PIECE_IMAGES[code];
}

export default PIECE_IMAGES;
