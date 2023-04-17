const defaultParams = {
    audio: false,
    video: {
        width: {
            min: 640,
            max: 1920
        },
        height: {
            min:  400,
            max: 1080
        }
    }
}

export const getUserMedia = (params = defaultParams) => {
    try {
        return navigator.mediaDevices.getUserMedia(params)
    } catch (e) {
        console.log(e)
    }
}
