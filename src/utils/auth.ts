import Cookies from 'js-cookie'

const uToken = 'u_token'
const darkMode = 'dark_mode';

// 获取Token
export function getToken() {
    return Cookies.get(uToken);
}

// 设置Token，1天,与后端同步
export function setToken(token: string, rememberMe = true) {
    return Cookies.set(uToken, token, { ...(rememberMe ? { expires: 1 } : {}), sameSite: 'strict', secure: location.protocol === 'https:' })
}

// 删除Token
export function removeToken() {
    return Cookies.remove(uToken)
}

export function removeAll() {
    return [uToken, darkMode].forEach(key => Cookies.remove(key))
}

export function setDarkMode(mode: boolean) {
    return Cookies.set(darkMode, String(mode), {expires: 365})
}

export function getDarkMode() {
    return !(undefined === Cookies.get(darkMode) || 'false' === Cookies.get(darkMode));
}