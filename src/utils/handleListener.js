export const addListener = (element, event, cb, options = {}) => {
    element.addEventListener(event, cb, options)
}

export const removeListener = (element, event, cb, options = {}) => {
    element.removeEventListener(event, cb, options)
}
