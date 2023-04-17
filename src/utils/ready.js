export const ready = (cb) => {
    document.addEventListener('DOMContentLoaded', cb, { once: true })
}
