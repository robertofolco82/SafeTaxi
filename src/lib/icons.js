/* Icone dell'interfaccia: SVG a linee (Lucide, licenza ISC), mai emoji.
   Ogni icona è importata come stringa (Vite `?raw`) e restituita pronta per essere
   inserita nell'HTML generato da src/app.js, con dimensione e classi personalizzabili. */
import shieldCheck from 'lucide-static/icons/shield-check.svg?raw';
import newspaper from 'lucide-static/icons/newspaper.svg?raw';
import user from 'lucide-static/icons/user.svg?raw';
import userRoundCheck from 'lucide-static/icons/user-round-check.svg?raw';
import map from 'lucide-static/icons/map.svg?raw';
import mapPin from 'lucide-static/icons/map-pin.svg?raw';
import bell from 'lucide-static/icons/bell.svg?raw';
import thumbsUp from 'lucide-static/icons/thumbs-up.svg?raw';
import thumbsDown from 'lucide-static/icons/thumbs-down.svg?raw';
import carTaxiFront from 'lucide-static/icons/car-taxi-front.svg?raw';
import play from 'lucide-static/icons/play.svg?raw';
import square from 'lucide-static/icons/square.svg?raw';
import send from 'lucide-static/icons/send.svg?raw';
import siren from 'lucide-static/icons/siren.svg?raw';
import flaskConical from 'lucide-static/icons/flask-conical.svg?raw';
import fileText from 'lucide-static/icons/file-text.svg?raw';
import camera from 'lucide-static/icons/camera.svg?raw';
import video from 'lucide-static/icons/video.svg?raw';
import mic from 'lucide-static/icons/mic.svg?raw';
import image from 'lucide-static/icons/image.svg?raw';
import thermometer from 'lucide-static/icons/thermometer.svg?raw';
import globe from 'lucide-static/icons/globe.svg?raw';
import phone from 'lucide-static/icons/phone.svg?raw';
import phoneCall from 'lucide-static/icons/phone-call.svg?raw';
import house from 'lucide-static/icons/house.svg?raw';
import buildingTwo from 'lucide-static/icons/building-2.svg?raw';
import landmark from 'lucide-static/icons/landmark.svg?raw';
import trophy from 'lucide-static/icons/trophy.svg?raw';
import gift from 'lucide-static/icons/gift.svg?raw';
import lifeBuoy from 'lucide-static/icons/life-buoy.svg?raw';
import battery from 'lucide-static/icons/battery.svg?raw';
import batteryCharging from 'lucide-static/icons/battery-charging.svg?raw';
import batteryLow from 'lucide-static/icons/battery-low.svg?raw';
import pkg from 'lucide-static/icons/package.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import keyRound from 'lucide-static/icons/key-round.svg?raw';
import eyeOff from 'lucide-static/icons/eye-off.svg?raw';
import circleHelp from 'lucide-static/icons/circle-help.svg?raw';
import star from 'lucide-static/icons/star.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import messageCircle from 'lucide-static/icons/message-circle.svg?raw';
import messageSquare from 'lucide-static/icons/message-square.svg?raw';
import smartphone from 'lucide-static/icons/smartphone.svg?raw';
import clock from 'lucide-static/icons/clock.svg?raw';
import planeTakeoff from 'lucide-static/icons/plane-takeoff.svg?raw';
import circleCheckBig from 'lucide-static/icons/circle-check-big.svg?raw';
import banknote from 'lucide-static/icons/banknote.svg?raw';
import ban from 'lucide-static/icons/ban.svg?raw';
import route from 'lucide-static/icons/route.svg?raw';
import octagonAlert from 'lucide-static/icons/octagon-alert.svg?raw';
import triangleAlert from 'lucide-static/icons/triangle-alert.svg?raw';
import sprayCan from 'lucide-static/icons/spray-can.svg?raw';
import micOff from 'lucide-static/icons/mic-off.svg?raw';
import paperclip from 'lucide-static/icons/paperclip.svg?raw';
import hourglass from 'lucide-static/icons/hourglass.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import mail from 'lucide-static/icons/mail.svg?raw';
import radio from 'lucide-static/icons/radio.svg?raw';
import undoTwo from 'lucide-static/icons/undo-2.svg?raw';
import trashTwo from 'lucide-static/icons/trash-2.svg?raw';
import refreshCw from 'lucide-static/icons/refresh-cw.svg?raw';
import eye from 'lucide-static/icons/eye.svg?raw';
import flag from 'lucide-static/icons/flag.svg?raw';

const ICONS = {
  'shield-check': shieldCheck, newspaper, user, 'user-round-check': userRoundCheck,
  map, 'map-pin': mapPin, bell, 'thumbs-up': thumbsUp, 'thumbs-down': thumbsDown,
  'car-taxi-front': carTaxiFront, play, square, send, siren, 'flask-conical': flaskConical,
  'file-text': fileText, camera, video, mic, image, thermometer, globe, phone,
  'phone-call': phoneCall, house, 'building-2': buildingTwo, landmark, trophy, gift,
  'life-buoy': lifeBuoy, battery, 'battery-charging': batteryCharging, 'battery-low': batteryLow,
  package: pkg, lock, 'key-round': keyRound, 'eye-off': eyeOff, 'circle-help': circleHelp,
  star, x, 'message-circle': messageCircle,
  'message-square': messageSquare, smartphone, clock, 'plane-takeoff': planeTakeoff,
  'circle-check-big': circleCheckBig, banknote, ban, route, 'octagon-alert': octagonAlert,
  'triangle-alert': triangleAlert, 'spray-can': sprayCan, 'mic-off': micOff, paperclip,
  hourglass, check, mail, radio, 'undo-2': undoTwo, 'trash-2': trashTwo, 'refresh-cw': refreshCw,
  eye, flag,
};

export function icon(name, {size = 18, className = ''} = {}){
  const raw = ICONS[name];
  if (!raw) { console.warn('[icons] icona sconosciuta:', name); return ''; }
  return raw
    .replace('width="24"', 'width="' + size + '"')
    .replace('height="24"', 'height="' + size + '"')
    .replace('class="lucide', 'class="icon' + (className ? ' ' + className : '') + ' lucide');
}
