/* ============ firebase-config.js — conexión con tu proyecto de Firebase ============
 * Pega aquí la configuración de tu app web de Firebase (Consola de Firebase >
 * Configuración del proyecto > Tus apps > SDK setup and configuration > Config).
 * Los pasos completos están en docs/FIREBASE.md.
 *
 * Estos datos NO son secretos: Firebase los diseña para ir en la web. Lo que
 * protege las partidas son las reglas de Firestore (firestore.rules).
 *
 * Si se pone a null, el juego funciona en modo local (sólo en el navegador).
 */
// Fork: MrSurvivor's own Firebase project (mrsurvivor, Spark plan, no billing).
// Upstream's pointed at JPTER78's project. Never enable Identity Platform on it.
G.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCe9Jj9SbaG_3TQwDnq-uhUI1-YN_v5YIo',
  authDomain: 'mrsurvivor.firebaseapp.com',
  projectId: 'mrsurvivor',
  storageBucket: 'mrsurvivor.firebasestorage.app',
  messagingSenderId: '180535262999',
  appId: '1:180535262999:web:3a79485fabdfa0124bc152',
  databaseURL: 'https://mrsurvivor-default-rtdb.firebaseio.com'
};

/* Ejemplo de cómo debe quedar:
G.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123'
};
*/
