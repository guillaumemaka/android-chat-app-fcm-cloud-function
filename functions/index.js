'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.sendNewMessageNotification = functions.database.ref('/messages/{roomID}/{messageId}')
  .onCreate((messageSnapshot, context) => {
    const message = messageSnapshot.val();
    const roomId = context.params.roomID;

    const getDeviceNotificationToken = admin.database()
      .ref(`/users/${message.to}/notificationTokens`).once('value');
    
      const getUserProfile = (userId) => {
        return admin.database()
        .ref(`/profiles/${userId}`).once('value');
      }

    const isRecipientConnectedPromise = admin.database()
      .ref(`/users/${message.to}/connected`).once('value');

    let tokenSnapshot;
    let connectedSnapshot;
    let profileToSnapshot;
    let profileFromSnapshot;
    let tokens;

    return Promise.all([
      isRecipientConnectedPromise,
      getDeviceNotificationToken,
      getUserProfile(message.to),
      getUserProfile(message.sender)
    ]).then(results => {
        connectedSnapshot = results[0];
        tokenSnapshot = results[1];
        profileToSnapshot = results[2];
        profileFromSnapshot = results[3];

        // If user is connecter let the realtime db handle it.
        if(connectedSnapshot.val()){
          return console.log("The user is connected, the real-time database will handle the new message!"); 
        }

        console.log('User', profileToSnapshot.key, "not connected attempting to send a notification!");
        
        // If we havn't registered token do nothing
        if(!tokenSnapshot.hasChildren()){
          return console.log('There are no notification tokens to send to.');
        }

        // Notification details.
        const payload = {
          notification: {
            clickAction: 'com.espacepiins.messenger.action.NEW_MESSAGE',
            title: 'You have a new message!',
            body: `${profileFromSnapshot.val().displayName} \n${message.content}.`,
            icon: profileFromSnapshot.val().avatarUrl,
            sound: '/res/raw/notification'
          },
          data: {
            roomId: roomId
          }
        };

        // Listing all devices tokens
        tokens = Object.keys(tokenSnapshot.val());
        
        // Send notification to the user devices
        return admin.messaging().sendToDevice(tokens, payload)
        .then(response => {
          // For each message check if there was an error.
          const tokensToRemove = [];
          response.results.forEach((result, index) => {
            const error = result.error;
            if (error) {
              console.error('Failure sending notification to', tokens[index], error);
              // Cleanup the tokens who are not registered anymore.
              if (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered') {
                tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
              }
            }
        });

        return Promise.all(tokensToRemove);
    });
  });
});