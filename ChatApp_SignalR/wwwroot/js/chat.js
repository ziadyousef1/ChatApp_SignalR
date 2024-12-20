﻿$(document).ready(function () {
    var connection = new signalR.HubConnectionBuilder().withUrl("/chatHub").build();
    var typingTimeout;

    connection.start().then(function () {
        console.log('SignalR Started...')
        viewModel.roomList();
        viewModel.userList();
    }).catch(function (err) {
        return console.error(err);
    });

    connection.on("newMessage", function (messageView) {
        var isMine = messageView.fromUserName === viewModel.myProfile().userName();
        var message = new ChatMessage(messageView.id, messageView.content, messageView.timestamp, messageView.fromUserName, messageView.fromFullName, isMine, messageView.avatar);
        viewModel.chatMessages.push(message);
        $(".messages-container").animate({ scrollTop: $(".messages-container")[0].scrollHeight }, 1000);
    });
    connection.on("updateMessage", function (updatedMessageView) {
        var message = viewModel.chatMessages().find(m => m.id() === updatedMessageView.id);
        if (message) {
            message.content(updatedMessageView.content);
            message.timestamp(updatedMessageView.timestamp);
        }
    });

    connection.on("getProfileInfo", function (user) {
        viewModel.myProfile(new ProfileInfo(user.userName, user.fullName, user.avatar));
        viewModel.isLoading(false);
    });

    connection.on("addUser", function (user) {
        viewModel.userAdded(new ChatUser(user.userName, user.fullName, user.avatar, user.currentRoom, user.device));
    });

    connection.on("removeUser", function (user) {
        viewModel.userRemoved(user.userName);
    });

    connection.on("addChatRoom", function (room) {
        viewModel.roomAdded(new ChatRoom(room.id, room.name, room.admin));
    });

    connection.on("updateChatRoom", function (room) {
        viewModel.roomUpdated(new ChatRoom(room.id, room.name, room.admin));
    });

    connection.on("removeChatRoom", function (id) {
        viewModel.roomDeleted(id);
    });

    connection.on("removeChatMessage", function (id) {
        viewModel.messageDeleted(id);
    });

    connection.on("onError", function (message) {
        viewModel.serverInfoMessage(message);
        $("#errorAlert").removeClass("d-none").show().delay(5000).fadeOut(500);
    });

    connection.on("onRoomDeleted", function () {
        if (viewModel.chatRooms().length == 0) {
            viewModel.joinedRoom(null);
        }
        else {
            viewModel.joinRoom(viewModel.chatRooms()[0]);
        }
    });
    connection.on("typing", function (user) {
        console.log(user.fullName + " is typing...");
        var typingElement = document.getElementById("typingIndicator");
        typingElement.textContent = user.fullName + " is typing...";
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function () {
            typingElement.textContent = "";
        }, 1500); 
    });



    connection.on("stopTyping", function () {
        console.log("Stop typing detected");
        $("#typingIndicator").text("");
    });




    function AppViewModel() {
        var self = this;

        self.message = ko.observable("");
        self.chatRooms = ko.observableArray([]);
        self.chatUsers = ko.observableArray([]);
        self.chatMessages = ko.observableArray([]);
        self.joinedRoom = ko.observable();
        self.serverInfoMessage = ko.observable("");
        self.myProfile = ko.observable();
        self.isLoading = ko.observable(true);
        self.messageToUpdate = ko.observable();

        $("#message-input").on("input", function () {
            console.log("Input detected");
            notifyTyping();
        });
        function notifyTyping() {
            if (viewModel.joinedRoom()) {
                console.log("Notify typing");
                clearTimeout(typingTimeout);
                connection.invoke("Typing", viewModel.joinedRoom().name())
                    .catch(function (err) {
                        console.error("Typing error: " + err);
                    });
                typingTimeout = setTimeout(stopTyping, 3000);
            }
        }

        function stopTyping() {
            if (viewModel.joinedRoom()) {
                connection.invoke("StopTyping", viewModel.joinedRoom().name())
                    .catch(function (err) {
                        console.error("Stop typing error: " + err);
                    });
            }
        }

        self.showUpdateModal = function(message) {
            console.log('Showing update modal for message:', message);
            self.messageToUpdate(message);
            $('#update-message-modal').modal('show');
        };

        document.getElementById('saveUpdatedMessage').onclick = function () {
            var updatedContent = document.getElementById('updateMessageContent').value;
            var messageId = viewModel.messageToUpdate().id();
            console.log('Updating message:',updatedContent, messageId);
            if (!updatedContent.trim()) {
                alert('Message cannot be empty');
                return;
            }

            fetch('/api/Messages/' + messageId, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ newMessage: updatedContent })
            })
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => {
                            throw new Error(text);
                        });
                    }
                    return response.json();
                }).catch(error => {
                    console.error('Error updating message:', error);
                });
        };
        self.showAvatar = ko.computed(function () {
            return self.isLoading() == false && self.myProfile().avatar() != null;
        });

        self.showRoomActions = ko.computed(function () {
            return self.joinedRoom()?.admin() == self.myProfile()?.userName();
        });

        self.onEnter = function (d, e) {
            if (e.keyCode === 13) {
                self.sendNewMessage();
                return false;
            }
            return true;
        }
        self.filter = ko.observable("");
        self.filteredChatUsers = ko.computed(function () {
            if (!self.filter()) {
                return self.chatUsers();
            } else {
                return ko.utils.arrayFilter(self.chatUsers(), function (user) {
                    var fullName = user.fullName().toLowerCase();
                    return fullName.includes(self.filter().toLowerCase());
                });
            }
        });

        self.sendNewMessage = function () {
            var text = self.message();
            if (text.startsWith("/")) {
                var receiver = text.substring(text.indexOf("(") + 1, text.indexOf(")"));
                var message = text.substring(text.indexOf(")") + 1, text.length);
                self.sendPrivate(receiver, message);
            }
            else {
                self.sendToRoom(self.joinedRoom(), self.message());
            }

            self.message("");
        }
        document.getElementById('message-input').addEventListener('keydown', function (e) {
            if (e.keyCode === 13) {
                sendNewMessage();
                e.preventDefault();
            }
        });
        document.getElementById('btn-send-message').addEventListener('click', sendNewMessage);

        async function sendNewMessage() {
            const messageInput = document.getElementById('message-input');
            const roomIdInput = document.getElementById('joinedRoom');
            const messageContent = messageInput.value;

            if (!messageContent.trim()) {
                alert('Message content is required.');
                return;
            }

            const message = {
                Content: messageContent,
                Room: roomIdInput.textContent
            };

            try {
                const response = await fetch('/api/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(message)
                });


                const result = await response.json();
                console.log('Message sent successfully:', result);
                messageInput.value = '';
            } catch (error) {
                console.error('Error sending message:', error);
            }
        }

        self.sendPrivate = function (receiver, message) {
            if (receiver.length > 0 && message.length > 0) {
                connection.invoke("SendPrivate", receiver.trim(), message.trim());
            }
        }

        self.joinRoom = function (room) {
            connection.invoke("Join", room.name()).then(function () {
                self.joinedRoom(room);
                self.userList();
                self.messageHistory();
            });
        }

        self.roomList = function () {
            fetch('/api/Rooms')
                .then(response => response.json())
                .then(data => {
                    self.chatRooms.removeAll();
                    for (var i = 0; i < data.length; i++) {
                        self.chatRooms.push(new ChatRoom(data[i].id, data[i].name, data[i].admin));
                    }

                    if (self.chatRooms().length > 0)
                        self.joinRoom(self.chatRooms()[0]);
                });
        }

        self.userList = function () {
            connection.invoke("GetUsers", self.joinedRoom()?.name()).then(function (result) {
                self.chatUsers.removeAll();
                for (var i = 0; i < result.length; i++) {
                    self.chatUsers.push(new ChatUser(result[i].userName,
                        result[i].fullName,
                        result[i].avatar,
                        result[i].currentRoom,
                        result[i].device))
                }
            });
        }
        self.createRoom = function () {
            var roomName = $("#roomName").val();
            fetch('/api/Rooms/Create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: roomName }),
                credentials: 'include' // Ensure cookies are included in the request
            })
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    } else {
                        return response.text().then(text => { throw new Error(text); });
                    }
                })
                .then(data => {
                    console.log('Room created:', data);
                })
                .catch(error => console.error('Error:', error));
        }
        document.getElementById('UploadedFile').addEventListener('change', function() {
            uploadFiles();
        });
        const roomIdInput = document.getElementById('joinedRoom');

        function uploadFiles() {
            var form = document.getElementById("uploadForm");
            var formData = new FormData(form);
            formData.append('RoomId', self.joinedRoom().id());


            fetch('/api/Upload', {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => { throw new Error(text); });
                    }
                    return response.json();
                })
                .then(data => {
                    document.getElementById("UploadedFile").value = "";
                    console.log('File uploaded successfully:', data);
                })
           
        }
        self.editRoom = function () {
            var roomId = self.joinedRoom().id();
            var roomName = $("#newRoomName").val();
            fetch('/api/Rooms/' + roomId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: roomId, name: roomName })
            });
        }

        self.deleteRoom = function () {
            fetch('/api/Rooms/' + self.joinedRoom().id(), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: self.joinedRoom().id() })
            });
        }

        self.deleteMessage = function () {
            var messageId = $("#itemToDelete").val();

            fetch('/api/Messages/' + messageId, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: messageId })
            });
        }

        self.messageHistory = function () {
            fetch('/api/Messages/Room/' + viewModel.joinedRoom().name())
                .then(response => response.json())
                .then(data => {
                    self.chatMessages.removeAll();
                    for (var i = 0; i < data.length; i++) {
                        var isMine = data[i].fromUserName == self.myProfile().userName();
                        self.chatMessages.push(new ChatMessage(data[i].id,
                            data[i].content,
                            data[i].timestamp,
                            data[i].fromUserName,
                            data[i].fromFullName,
                            isMine,
                            data[i].avatar))
                    }

                    $(".messages-container").animate({ scrollTop: $(".messages-container")[0].scrollHeight }, 1000);
                });
        }

        self.roomAdded = function (room) {
            self.chatRooms.push(room);
        }

        self.roomUpdated = function (updatedRoom) {
            var room = ko.utils.arrayFirst(self.chatRooms(), function (item) {
                return updatedRoom.id() == item.id();
            });

            room.name(updatedRoom.name());

            if (self.joinedRoom().id() == room.id()) {
                self.joinRoom(room);
            }
        }

        self.roomDeleted = function (id) {
            var temp;
            ko.utils.arrayForEach(self.chatRooms(), function (room) {
                if (room.id() == id)
                    temp = room;
            });
            self.chatRooms.remove(temp);
        }

        self.messageDeleted = function (id) {
            var temp;
            ko.utils.arrayForEach(self.chatMessages(), function (message) {
                if (message.id() == id)
                    temp = message;
            });
            self.chatMessages.remove(temp);
        }

        self.userAdded = function (user) {
            self.chatUsers.push(user);
        }

        self.userRemoved = function (id) {
            var temp;
            ko.utils.arrayForEach(self.chatUsers(), function (user) {
                if (user.userName() == id)
                    temp = user;
            });
            self.chatUsers.remove(temp);
        }

      
    }

    function ChatRoom(id, name, admin) {
        var self = this;
        self.id = ko.observable(id);
        self.name = ko.observable(name);
        self.admin = ko.observable(admin);
    }

    function ChatUser(userName, fullName, avatar, currentRoom, device) {
        var self = this;
        self.userName = ko.observable(userName);
        self.fullName = ko.observable(fullName);
        self.avatar = ko.observable(avatar);
        self.currentRoom = ko.observable(currentRoom);
        self.device = ko.observable(device);
    }

    function ChatMessage(id, content, timestamp, fromUserName, fromFullName, isMine, avatar) {
        var self = this;
        self.id = ko.observable(id);
        self.content = ko.observable(content);
        self.timestamp = ko.observable(timestamp);
        self.timestampRelative = ko.pureComputed(function () {
            var date = new Date(self.timestamp());
            var now = new Date();
            var diff = Math.round((date.getTime() - now.getTime()) / (1000 * 3600 * 24));

            var { dateOnly, timeOnly } = formatDate(date);

            if (diff == 0)
                return `Today, ${timeOnly}`;
            if (diff == -1)
                return `Yestrday, ${timeOnly}`;

            return `${dateOnly}`;
        });
        self.timestampFull = ko.pureComputed(function () {
            var date = new Date(self.timestamp());
            var { fullDateTime } = formatDate(date);
            return fullDateTime;
        });
        self.fromUserName = ko.observable(fromUserName);
        self.fromFullName = ko.observable(fromFullName);
        self.isMine = ko.observable(isMine);
        self.avatar = ko.observable(avatar);
    }

    function ProfileInfo(userName, fullName, avatar) {
        var self = this;
        self.userName = ko.observable(userName);
        self.fullName = ko.observable(fullName);
        self.avatar = ko.observable(avatar);
    }

    function formatDate(date) {
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var day = date.getDate();
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var d = hours >= 12 ? "PM" : "AM";

        if (hours > 12)
            hours = hours % 12;

        if (minutes < 10)
            minutes = "0" + minutes;

        var dateOnly = `${day}/${month}/${year}`;
        var timeOnly = `${hours}:${minutes} ${d}`;
        var fullDateTime = `${dateOnly} ${timeOnly}`;

        return { dateOnly, timeOnly, fullDateTime };
    }

    var viewModel = new AppViewModel();
    ko.applyBindings(viewModel);
});