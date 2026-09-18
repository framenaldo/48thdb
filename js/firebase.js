  const firebaseConfig = {
    apiKey: "AIzaSyDnh4nwoEyJor6GHFyZL8CqWhq5xVcejOg",
    authDomain: "thdatabase.firebaseapp.com",
    projectId: "thdatabase",
    storageBucket: "thdatabase.firebasestorage.app",
    messagingSenderId: "786675755170",
    appId: "1:786675755170:web:0c96de3abb4dcf24e50ffb",
    measurementId: "G-RB8KWSK0PN"
  };
  firebase.initializeApp(firebaseConfig);
  const fbAuth = firebase.auth();
  const fbDb = firebase.firestore();
