import { describe, it, expect } from 'vitest'
import { generate } from '../src/codegen/generate'
import { makeProject, makeSeedProject } from './helpers'

describe('codegen - includes', () => {
  it('always includes freertos and nvs_flash headers', () => {
    const { files } = generate(makeProject())
    expect(files['main/app_main.c']).toContain('#include "freertos/FreeRTOS.h"')
    expect(files['main/app_main.c']).toContain('#include "nvs_flash.h"')
  })

  it('includes gpio.h when components have digital pins', () => {
    const { files } = generate(makeSeedProject())
    expect(files['main/app_main.c']).toContain('#include "driver/gpio.h"')
  })
})

describe('codegen - pin macros', () => {
  it('defines PIN macro for directly-wired pins', () => {
    const { files } = generate(makeSeedProject())
    expect(files['main/app_main.c']).toContain('#define PIN_BTN1_A 4')
    expect(files['main/app_main.c']).toContain('#define PIN_R1_IN 16')
  })
})

describe('codegen - gpio direction', () => {
  it('configures output component pin (digital_in type) as GPIO_MODE_OUTPUT', () => {
    // r1.in is digital_in (resistor receives from MCU), so the MCU GPIO is OUTPUT
    const { files } = generate(makeSeedProject())
    expect(files['main/app_main.c']).toContain('gpio_set_direction(PIN_R1_IN, GPIO_MODE_OUTPUT)')
  })
})

describe('codegen - CMakeLists', () => {
  it('always requires driver and nvs_flash', () => {
    const { files } = generate(makeProject())
    expect(files['main/CMakeLists.txt']).toContain('"driver"')
    expect(files['main/CMakeLists.txt']).toContain('"nvs_flash"')
  })
})

describe('codegen - sdkconfig.defaults', () => {
  it('sets correct IDF target', () => {
    const p = makeProject({ board: 'esp32s3-devkitc-1', target: 'esp32s3' })
    const { files } = generate(p)
    expect(files['sdkconfig.defaults']).toContain('CONFIG_IDF_TARGET="esp32s3"')
  })

  it('sets FREERTOS_HZ=1000 on all boards', () => {
    const { files } = generate(makeProject())
    expect(files['sdkconfig.defaults']).toContain('CONFIG_FREERTOS_HZ=1000')
  })

  it('sets correct CPU frequency for esp32', () => {
    const { files } = generate(makeProject())
    expect(files['sdkconfig.defaults']).toContain('CONFIG_ESP32_DEFAULT_CPU_FREQ_240=y')
  })

  it('enables USB CDC for S3 board', () => {
    const p = makeProject({ board: 'esp32s3-devkitc-1', target: 'esp32s3' })
    const { files } = generate(p)
    expect(files['sdkconfig.defaults']).toContain('CONFIG_ESP_CONSOLE_USB_CDC=y')
  })
})
