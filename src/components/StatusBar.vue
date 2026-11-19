<script>
    import { mapState, mapStores } from 'pinia'
    import UpdateStatusItem from './UpdateStatusItem.vue'
    import { LANGUAGES } from '../editor/languages.js'
    import { formatDate, formatFullDate } from '../common/format-date'
    import { useHeynoteStore } from "../stores/heynote-store"
    import { useSettingsStore } from "../stores/settings-store"
    
    const LANGUAGE_MAP = Object.fromEntries(LANGUAGES.map(l => [l.token, l]))
    const LANGUAGE_NAMES = Object.fromEntries(LANGUAGES.map(l => [l.token, l.name]))


    export default {
        props: [
            "autoUpdate",
            "allowBetaVersions",
        ],

        components: {
            UpdateStatusItem,
        },

        data() {
            return {
                isWebApp: window.heynote.platform.isWebApp,
            }
        },

        mounted() {
            
        },

        computed: {
            ...mapStores(useHeynoteStore),
            ...mapState(useHeynoteStore, [
                "currentBufferName",
                "currentCursorLine",
                "currentLanguage", 
                "currentSelectionSize", 
                "currentLanguage",
                "currentLanguageAuto",
                "currentCreatedTime",
                "systemLocale",
            ]),
            ...mapState(useSettingsStore, [
                "spellcheckEnabled",
                "alwaysOnTop",
                "settings",
                "commandKeyBindingsMap",
            ]),

            languageName() {
                return LANGUAGE_NAMES[this.currentLanguage] || this.currentLanguage
            },

            className() {
                return `status`
            },

            supportsFormat() {
                const lang = LANGUAGE_MAP[this.currentLanguage]
                return !!lang ? lang.supportsFormat : false
            },

            cmdKey() {
                return window.heynote.platform.isMac ? "⌘" : "Ctrl"
            },

            formatBlockTitle() {
                return `Format Block Content (Alt + Shift + F)`
            },

            updatesEnabled() {
                return !!window.heynote.autoUpdate
            },


            formattedCreatedTime() {
                if (!this.currentCreatedTime) {
                    return null
                }
                return formatDate(this.currentCreatedTime, this.systemLocale)
            },

            createdTimeTitle() {
                if (!this.currentCreatedTime) {
                    return null
                }
                return "Block created " +  formatFullDate(this.currentCreatedTime, this.systemLocale)
            },
        },

        methods: {
            onSpellcheckingContextMenu(event) {
                event.preventDefault()
                window.heynote.mainProcess.invoke('showSpellcheckingContextMenu')
            },

            getTooltip(text, command) {
                const bindings = this.commandKeyBindingsMap[command]
                return bindings.length === 0 ? text : `${text} (${bindings[0]})`
            }
        },
    }
</script>

<template>
    <div :class="className">
        <button type="button"
            @click.stop="$emit('toggleLeftPanel')"
            class="status-block sidebar clickable"
            aria-label="Toggle sidebar"
            :title="getTooltip('Toggle Sidebar', 'toggleLeftPanel')"
        >
            <span class="icon icon-format"></span>
        </button>
        <div class="status-block line-number">
            Ln <span class="num">{{ currentCursorLine?.line }}</span>
            Col <span class="num">{{ currentCursorLine?.col }}</span>
            <template v-if="currentSelectionSize > 0">
                Sel <span class="num">{{ currentSelectionSize }}</span>
            </template>
        </div>
        <div 
            :title="createdTimeTitle"
            class="status-block created-time"
        >
            {{ formattedCreatedTime }}
        </div>
        <div class="spacer"></div>
        <button type="button"
            @click.stop="$emit('openBufferSelector')"
            class="status-block note clickable"
            :title="getTooltip(currentBufferName + ' — Change Buffer', 'openBufferSelector')"
        >
            {{ currentBufferName }} 
        </button>
        <button type="button"
            @click.stop="$emit('openLanguageSelector')"
            class="status-block lang clickable"
            :title="getTooltip('Change language for current block', 'openLanguageSelector')"
        >
            {{ languageName }} 
            <span v-if="currentLanguageAuto" class="auto">(auto)</span>
        </button>
        <button type="button"
            v-if="supportsFormat"
            @click.stop="$emit('formatCurrentBlock')"
            class="status-block format clickable"
            aria-label="Format block content"
            :title="getTooltip('Format Block Content', 'formatBlockContent')"
        >
            <span class="icon icon-format"></span>
        </button>
        <button type="button"
            @click.stop="$emit('toggleSpellcheck')"
            @mousedown.prevent
            @contextmenu="onSpellcheckingContextMenu"
            :class="'status-block spellcheck clickable' + (this.spellcheckEnabled ? ' spellcheck-enabled' : '')"
            aria-label="Spellchecking"
            :aria-pressed="spellcheckEnabled"
            :title="getTooltip('Spellchecking', 'toggleSpellcheck')"
        >
            <span class="icon icon-format"></span>
        </button>

        <button type="button"
            v-if="!isWebApp"
            @click.stop="$emit('toggleAlwaysOnTop')"
            @mousedown.prevent
            class="status-block pin clickable"
            aria-label="Always on top"
            :aria-pressed="alwaysOnTop"
            :title="getTooltip('Pin', 'toggleAlwaysOnTop')"
        >
            <span class="icon icon-format" :class="{'pinned': alwaysOnTop}"></span>
        </button>

        <UpdateStatusItem 
            v-if="updatesEnabled" 
            :autoUpdate="autoUpdate"
            :allowBetaVersions="allowBetaVersions"
        />
        <button type="button"
            @click.stop="$emit('openSettings')"
            class="status-block settings clickable"
            aria-label="Settings"
            title="Settings"
        >
            <span class="icon icon-format"></span>
        </button>
    </div>
</template>

<style scoped lang="sass">
    .status
        box-sizing: border-box
        height: var(--status-bar-height)
        width: 100%
        background: var(--status-bar-background)
        color: var(--status-bar-color)
        font-family: "Open Sans"
        font-size: 12px
        padding-left: 0px
        padding-right: 0px
        display: flex
        flex-direction: row
        align-items: center
        user-select: none
        white-space: nowrap
        overflow: hidden

        .spacer
            flex-grow: 1
            min-width: 0
        
        .status-block
            box-sizing: border-box
            height: var(--status-bar-height)
            padding: 0 10px
            flex-shrink: 0
            border: none
            border-radius: 0
            background: none
            color: inherit
            font: inherit
            line-height: var(--status-bar-height)
            cursor: default
            &:first-child
                padding-left: 12px
            &:last-child
                padding-right: 12px
            &.clickable
                cursor: pointer
                &:focus-visible
                    outline: 2px solid #93c5fd
                    outline-offset: -3px
                &:hover
                    background-color: rgba(255,255,255, 0.1)
            .icon
                display: block
                width: 14px
                height: var(--status-bar-height)
                +dark-mode
                    opacity: 0.9
        .line-number
            color: rgba(255, 255, 255, 0.7)
            .num
                color: rgba(255, 255, 255, 1.0)
            +dark-mode
                color: rgba(255, 255, 255, 0.55)
                .num
                    color: rgba(255, 255, 255, 0.75)
        .lang .auto
            color: rgba(255, 255, 255, 0.7)
            +dark-mode
                color: rgba(255, 255, 255, 0.55)

        .note, .lang
            min-width: 0
            overflow: hidden
            text-overflow: ellipsis
            white-space: nowrap
            flex-shrink: 1
        .note
            max-width: 35%
        .lang
            max-width: 28%

        @media (max-width: 700px)
            .created-time
                display: none
        @media (max-width: 420px)
            .line-number
                display: none
        
        .sidebar
            padding-top: 0
            padding-bottom: 0
            .icon
                background-size: 15px
                background-repeat: no-repeat
                background-position: center center
                background-image: url("@/assets/icons/sidebar.svg")
        
        .format
            padding-top: 0
            padding-bottom: 0
            .icon
                background-size: 16px
                background-repeat: no-repeat
                background-position: center center
                background-image: url("@/assets/icons/format.svg")

        .spellcheck
            padding-top: 0
            padding-bottom: 0
            opacity: 1.0
            .icon
                background-size: 13px
                background-repeat: no-repeat
                background-position: center center
                background-image: url("@/assets/icons/spellcheck-off.svg")
            &.spellcheck-enabled .icon
                background-image: url("@/assets/icons/spellcheck.svg")
        
        .pin
            padding-top: 0
            padding-bottom: 0
            .icon   
                background-size: 13px
                background-repeat: no-repeat
                background-position: center center
                background-image: url("@/assets/icons/pin.svg")
                &.pinned
                    background-image: url("@/assets/icons/pin-pinned.svg")
        
        .settings
            padding-top: 0
            padding-bottom: 0
            .icon
                background-size: 13px
                background-repeat: no-repeat
                background-position: center center
                background-image: url("@/assets/icons/settings.svg")

</style>
