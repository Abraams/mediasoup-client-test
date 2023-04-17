import { io } from 'socket.io-client'
import { Device as MediasoupDevice } from 'mediasoup-client'
import { ready } from "./utils/ready";
import { SERVER_HOST, SERVER_PORT, SIGNALING_SOCKET_NAMESPACE } from "./config";
import { querySelector } from "./utils/querySelector";
import { getUserMedia } from './utils/getUserMedia'

const localVideo = querySelector('#localVideo')
const videoContainer = querySelector('#videoContainer')

let socket

let localUserMedia = null
let device = null
let mediasoupParams = {
    encoding: [
        {
            rid: 'r0',
            maxBitrate: 100000,
            scalabilityMode: 'S1T3'
        },
        {
            rid: 'r1',
            maxBitrate: 300000,
            scalabilityMode: 'S1T3'
        },
        {
            rid: 'r2',
            maxBitrate: 900000,
            scalabilityMode: 'S1T3'
        },
    ],
    codecOptions: {
        videoGoogleStartBitrate: 1000
    }
}
let rtpCapabilities = null
let producerTransport = null
let consumerTransports = []
let producer = null

const getRoomName = () => window.location.href.split('#').slice(-1)[0]

const createVideo = (id, stream) => {
    const wrapper = document.createElement('div')
    wrapper.id = `wrapper-${id}`
    wrapper.classList.add('remoteVideo')

    const videoElement = document.createElement('video')
    videoElement.id = id
    videoElement.setAttribute('autoplay', 'autoplay')
    videoElement.classList.add('video')
    videoElement.srcObject = stream

    wrapper.prepend(videoElement)
    videoContainer.prepend(wrapper)
}

const removeVideo = (id) => document.getElementById(`wrapper-${id}`).remove()

const setLocalUserMedia = async () => {
    localUserMedia = await getUserMedia()
    localVideo.srcObject = localUserMedia
    localVideo.muted = true
    const track = localUserMedia.getVideoTracks()[0]

    console.log(localUserMedia.getVideoTracks())

    mediasoupParams = {
        ...mediasoupParams,
        track
    }
}

const signalNewConsumerTransport = async (remoteProducerId) => {
    await socket.emit('createWebRtcTransport', { consumer: true  }, ({ params }) => {
        if (params.error) {
            console.error(params.error)
            return
        }

        const consumerTransport = device.createRecvTransport(params)

        consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {

                await socket.emit('transport-receive-connect', {
                    dtlsParameters,
                    serverConsumerTransportId: params.id
                })

                callback()
            } catch (e) {
                errback(e)
            }
        })

        connectReceiveSendTransport(consumerTransport, remoteProducerId, params.id)
    })
}

const getProducers = () => {
    socket.emit('getProducers', (producerIds) => {
        producerIds.forEach(signalNewConsumerTransport)
    })
}

const createSendTransport =  () => {
    socket.emit('createWebRtcTransport', { consumer: false }, async ({ params }) => {
        if (params.error) {
            console.error(params.error)
            return
        }

        producerTransport = device.createSendTransport(params)

        producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await socket.emit('transport-connect', { dtlsParameters })

                callback()
            } catch (e) {
                errback(e)
            }
        })

        producerTransport.on('produce', async (parameters, callback, errback) => {
            try {
                await socket.emit('transport-produce', {
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    appData: parameters.appData
                }, ({ id, producersExist }) => {
                    callback(id)
                    console.log(producersExist)

                    if (producersExist) {
                        getProducers()
                    }
                })
            } catch (e) {
                errback(e)
            }
        })

        await connectSendTransport()
    })
}

const createDevice = async () => {
    try {
        device = new MediasoupDevice()

        await device.load({
            routerRtpCapabilities: rtpCapabilities
        })

        createSendTransport()
    } catch (e) {
        console.error(e)
    }
}

const connectSendTransport = async () => {
    producer = await producerTransport.produce(mediasoupParams)
}

const connectReceiveSendTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
    await socket.emit('consume', {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId
    }, async ({ params }) => {
        console.log('on consume')
        if (params.error) {
            console.error(params.error)
            return
        }

        const consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
        })

        consumerTransports.push({
            consumerTransport,
            serverConsumerTransportId: params.id,
            producerId: params.producerId,
            consumer
        })


        const { track } = consumer

        createVideo(remoteProducerId, new MediaStream([track]))

        socket.emit('consumer-resume', { serverConsumerId: params.id })
    })
}

const joinRoom = async (roomName) => {
    await setLocalUserMedia()

    socket.emit('joinRoom', { roomName }, (data) => {
        rtpCapabilities = data.rtpCapabilities

        createDevice()
    })
}

const setup = () => {
    const socketURL = `${SERVER_HOST}:${SERVER_PORT}${SIGNALING_SOCKET_NAMESPACE}`
    socket = io(socketURL)

    socket.on('connection_success', async ({ socketId }) => {
        console.log(socketId)
        await joinRoom(getRoomName())
    })

    socket.on('new-producer', signalNewConsumerTransport)

    socket.on('producer-closed', ({ remoteProducerId }) => {
        console.log(remoteProducerId)
        const producerToClose = consumerTransports
            .find(transportData => transportData.producerId === remoteProducerId)

        producerToClose.consumerTransport.close()
        producerToClose.consumer.close()

        consumerTransports
            .filter(transportData => transportData.producerId !== remoteProducerId)

        removeVideo(remoteProducerId)
    })
}

ready(setup)
