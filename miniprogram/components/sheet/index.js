Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    hint: { type: String, value: '' },
    maxHeight: { type: Number, value: 0 }
  },

  data: {
    visible: false,
    closing: false
  },

  observers: {
    show(value) {
      if (value) {
        if (this._closeTimer) clearTimeout(this._closeTimer)
        this.setData({ visible: true, closing: false })
      } else if (this.data.visible) {
        this.setData({ closing: true })
        this._closeTimer = setTimeout(() => {
          this.setData({ visible: false, closing: false })
        }, 180)
      }
    }
  },

  lifetimes: {
    attached() {
      if (this.data.show) this.setData({ visible: true })
    },
    detached() {
      if (this._closeTimer) clearTimeout(this._closeTimer)
    }
  },

  methods: {
    onMask() {
      this.triggerEvent('close')
    },

    onClose() {
      this.triggerEvent('close')
    },

    noop() {}
  }
})
