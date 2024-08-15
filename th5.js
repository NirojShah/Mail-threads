const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Create an IMAP connection
const imap = new Imap({
    user: 'niroj',
    password: '123456',
    host: '192.168.0.119',
    port: 143,
    tls: false
});

// Utility function to open the mailbox
function openInbox(callback) {
    imap.openBox('INBOX', false, callback);
}

// Fetch emails based on a list of message IDs
function fetchEmails(messageIds, callback) {
    console.log('Fetching message IDs:', messageIds);
    if (messageIds.length === 0) {
        console.log('No message IDs to fetch');
        callback();
        return;
    }

    imap.search(['ALL'], function (err, results) {
        if (err) {
            console.error('Error searching emails:', err);
            return;
        }

        const fetch = imap.fetch(results, { bodies: '' });

        fetch.on('message', function (msg, seqno) {
            console.log('Fetching message', seqno);
            msg.on('body', function (stream, info) {
                simpleParser(stream, async (err, parsed) => {
                    if (err) {
                        console.error('Error parsing email:', err);
                        return;
                    }

                    if (messageIds.includes(parsed.messageId)) {
                        console.log("-----------------------------------------------------");

                        const mail = {
                            from: parsed.from.text,
                            to: parsed.to.text,
                            messageId: parsed.messageId,
                            references: Array.isArray(parsed.references) ? parsed.references.join(', ') : (parsed.references || ''),
                            inReplyTo: parsed.inReplyTo || '',
                            body: parsed.text,
                            html: parsed.html,
                            attachments: parsed.attachments.map(att => ({
                                filename: att.filename,
                                contentType: att.contentType,
                                contentDisposition: att.contentDisposition,
                                contentId: att.contentId
                            }))
                        };

                        console.log('Parsed email:', mail);
                    }
                });
            });
        });

        fetch.once('end', function () {
            console.log('Fetch ended');
            callback();
        });
    });
}

// Fetch UIDs based on message ID
function fetchUIDsFromMessageIds(callback) {
    imap.search(['ALL'], function (err, results) {
        if (err) {
            console.error('Error searching emails:', err);
            return;
        }

        const fetch = imap.fetch(results, { bodies: ['HEADER.FIELDS (MESSAGE-ID)'], struct: true });

        const messageIdToUID = new Map();

        fetch.on('message', function (msg, seqno) {
            msg.on('body', function (stream, info) {
                let header = '';

                stream.on('data', function (chunk) {
                    header += chunk.toString();
                });

                stream.on('end', function () {
                    console.log("Full Header:", header); // Log full header for inspection

                    const messageIdMatch = header.match(/Message-ID:\s*(.*)/i);
                    const messageId = messageIdMatch ? messageIdMatch[1].trim() : null;

                    console.log("Extracted messageId:", messageId);
                    
                    if (messageId) {
                        console.log(`Mapping messageId ${messageId} to UID ${seqno}`);
                        messageIdToUID.set(messageId, seqno);
                    } else {
                        console.log('Message-ID header not found');
                    }
                });
            });
        });

        fetch.once('end', function () {
            console.log('UIDs fetched:', Array.from(messageIdToUID.entries()));
            callback(messageIdToUID);
        });
    });
}

function fetchRelatedEmails(messageId, callback) {
    fetchUIDsFromMessageIds(function (messageIdToUID) {
        const messageIds = [];

        imap.search(['ALL'], function (err, results) {
            if (err) {
                console.error('Error searching emails:', err);
                return;
            }

            const fetch = imap.fetch(results, { bodies: ['HEADER.FIELDS (REFERENCES IN-REPLY-TO MESSAGE-ID)'], struct: true });

            fetch.on('message', function (msg, seqno) {
                console.log("Fetching message", seqno);
                msg.on('body', function (stream, info) {
                    let header = '';

                    stream.on('data', function (chunk) {
                        header += chunk.toString();
                    });

                    stream.on('end', function () {
                        try {
                            const parsed = Imap.parseHeader(header);
                            console.log("Full Header:", header);
                            console.log("Parsed Header:", parsed);

                            const references = Array.isArray(parsed.references) ? parsed.references : [];
                            const inReplyTo = Array.isArray(parsed['in-reply-to']) ? parsed['in-reply-to'][0] : parsed['in-reply-to'] || '';
                            const messageIdHeader = Array.isArray(parsed['message-id']) ? parsed['message-id'][0] : parsed['message-id'] || '';

                            console.log(`References: ${references.join(', ')}, In-Reply-To: ${inReplyTo}`);
                            console.log('Extracted messageId:', messageIdHeader);

                            if (references.includes(messageId) || inReplyTo === messageId) {
                                if (messageIdHeader) {
                                    if (!messageIds.includes(messageIdHeader)) {
                                        messageIds.push(messageIdHeader);
                                        console.log(`Adding messageId ${messageIdHeader} to fetch list`);
                                    }
                                } else {
                                    console.log('No messageId found for message:', parsed);
                                }
                            }
                        } catch (err) {
                            console.error('Error parsing header:', err);
                        }
                    });
                });
            });

            fetch.once('end', function () {
                console.log('Related emails fetched with message IDs:', messageIds);
                fetchEmails(messageIds, callback);
            });
        });
    });
}


// Connect to IMAP and fetch emails
imap.once('ready', function () {
    console.log('IMAP connection established');
    openInbox(function (err, box) {
        if (err) {
            console.error('Error opening inbox:', err);
            return;
        }

        // Fetch email UIDs and their details
        fetchRelatedEmails('<6dbd362d-105d-48fe-9f69-19771e9899c9@qugates.in>', function () {
            console.log('Fetch ended');
            imap.end();
        });
    });
});

imap.once('error', function (err) {
    console.error('IMAP error:', err);
});

imap.once('end', function () {
    console.log('IMAP connection ended');
});

// Connect to the IMAP server
imap.connect();
