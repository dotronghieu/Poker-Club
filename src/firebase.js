import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Thay thế các thông số dưới đây bằng cấu hình từ tài khoản Firebase của bạn
const firebaseConfig = {
  apiKey: "AIzaSyB_prTGOUXV6amg7TJ_OIlK2Z4rdmNesSM",
  authDomain: "pokerclub-c3c6a.firebaseapp.com",
  projectId: "pokerclub-c3c6a",
  storageBucket: "pokerclub-c3c6a.firebasestorage.app",
  messagingSenderId: "416008310164",
  appId: "1:416008310164:web:deb59394a33d2be86d5381",
  measurementId: "G-KTN7HW6XL4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);